import UIKit
import WebKit
import Capacitor

/// Решает DataDome challenge через скрытый WKWebView.
///
/// solveCaptcha(url) — загружает конкретный challenge URL (geo.captcha-delivery.com),
/// DataDome fingerprints реальный браузер, ставит cookie, мы его читаем и возвращаем.
///
/// fetchCookie() — fallback: загружает soundcloud.com (может быть заблокирован в RU).
@objc(DataDomePlugin)
public class DataDomePlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "DataDomePlugin"
    public let jsName = "DataDome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "solveCaptcha", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchCookie",  returnType: CAPPluginReturnPromise),
    ]

    private static var handlerKey = "DataDomePlugin.handlerKey"

    // MARK: - solveCaptcha(url)

    /// Загружает DataDome challenge URL в скрытом WKWebView.
    /// DataDome JS fingerprints WKWebView как реальный браузер (auto-solve),
    /// ставит cookie datadome для .soundcloud.com, мы читаем и возвращаем.
    @objc func solveCaptcha(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr) else {
            call.reject("Invalid URL")
            return
        }
        launchHiddenWebView(url: url, call: call)
    }

    // MARK: - fetchCookie() — fallback

    /// Загружает soundcloud.com напрямую (требует доступа к soundcloud.com).
    @objc func fetchCookie(_ call: CAPPluginCall) {
        guard let url = URL(string: "https://soundcloud.com") else {
            call.reject("Bad URL")
            return
        }
        launchHiddenWebView(url: url, call: call)
    }

    // MARK: - Shared

    private func launchHiddenWebView(url: URL, call: CAPPluginCall) {
        DispatchQueue.main.async {
            let keyWindow = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first { $0.isKeyWindow }

            guard let window = keyWindow else {
                call.reject("No key window")
                return
            }

            let config = WKWebViewConfiguration()
            config.websiteDataStore = WKWebsiteDataStore.default()

            // Off-screen 1×1 — JS выполняется, пользователь не видит
            let webView = WKWebView(
                frame: CGRect(x: -2, y: -2, width: 1, height: 1),
                configuration: config
            )
            window.addSubview(webView)

            let handler = DDNavigationHandler(call: call, webView: webView)
            webView.navigationDelegate = handler
            objc_setAssociatedObject(
                webView, &DataDomePlugin.handlerKey, handler,
                .OBJC_ASSOCIATION_RETAIN_NONATOMIC
            )

            var req = URLRequest(url: url)
            req.timeoutInterval = 25
            webView.load(req)
        }
    }
}

// MARK: - Navigation delegate

private class DDNavigationHandler: NSObject, WKNavigationDelegate {

    let call: CAPPluginCall
    weak var webView: WKWebView?
    private var resolved = false

    init(call: CAPPluginCall, webView: WKWebView) {
        self.call = call
        self.webView = webView
    }

    /// Когда DataDome auto-solve срабатывает, страница редиректит на referer
    /// (api-v2.soundcloud.com). Перехватываем редирект, читаем cookie и отменяем навигацию.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        let host = navigationAction.request.url?.host ?? ""
        let isDataDomeDomain = host.contains("datadome") || host.contains("captcha-delivery")

        if !isDataDomeDomain && navigationAction.navigationType == .other {
            // Редирект в сторонний домен → challenge решён, читаем cookie
            decisionHandler(.cancel)
            finish()
        } else {
            decisionHandler(.allow)
        }
    }

    /// Страница загрузилась (DataDome не редиректнул) — ждём, пока JS отработает
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) { [weak self] in
            self?.finish()
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        cleanup()
        guard !resolved else { return }
        resolved = true
        call.reject("Navigation failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        cleanup()
        guard !resolved else { return }
        resolved = true
        call.reject("Load failed: \(error.localizedDescription)")
    }

    private func finish() {
        guard !resolved else { return }
        resolved = true

        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self = self else { return }

            // Ищем datadome cookie для любого домена soundcloud.com
            let dd = cookies.first {
                $0.name == "datadome" &&
                ($0.domain.contains("soundcloud.com") || $0.domain.contains("captcha-delivery"))
            }

            DispatchQueue.main.async { self.cleanup() }

            if let dd = dd {
                self.call.resolve(["cookie": dd.value])
            } else {
                self.call.reject("datadome cookie not found after challenge")
            }
        }
    }

    private func cleanup() {
        webView?.removeFromSuperview()
        webView = nil
    }
}

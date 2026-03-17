import UIKit
import WebKit
import Capacitor

/// Запускает скрытый WKWebView → загружает soundcloud.com → DataDome JS отрабатывает
/// → извлекаем cookie datadome → возвращаем в JS слой.
@objc(DataDomePlugin)
public class DataDomePlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "DataDomePlugin"
    public let jsName = "DataDome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "fetchCookie", returnType: CAPPluginReturnPromise),
    ]

    /// Загружает soundcloud.com в скрытом WKWebView, ждёт 4 секунды (DataDome JS),
    /// читает cookie datadome, возвращает { cookie: String }.
    @objc func fetchCookie(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // Ищем ключевое окно
            let keyWindow = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first { $0.isKeyWindow }

            guard let window = keyWindow else {
                call.reject("No key window found")
                return
            }

            // Shared data store — тот же, что использует основной WKWebView Capacitor
            let config = WKWebViewConfiguration()
            config.websiteDataStore = WKWebsiteDataStore.default()

            // Ставим за пределами экрана, чтобы JS выполнялся (нельзя hidden=true)
            let webView = WKWebView(
                frame: CGRect(x: -2, y: -2, width: 1, height: 1),
                configuration: config
            )
            window.addSubview(webView)

            // Делегат живёт через associated object
            let handler = DataDomeNavigationHandler(call: call, webView: webView)
            webView.navigationDelegate = handler
            objc_setAssociatedObject(webView, &DataDomePlugin.handlerKey, handler, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)

            var req = URLRequest(url: URL(string: "https://soundcloud.com")!)
            req.timeoutInterval = 20
            webView.load(req)
        }
    }

    private static var handlerKey = "DataDomePlugin.handlerKey"
}

// MARK: - Navigation delegate

private class DataDomeNavigationHandler: NSObject, WKNavigationDelegate {

    let call: CAPPluginCall
    weak var webView: WKWebView?

    init(call: CAPPluginCall, webView: WKWebView) {
        self.call = call
        self.webView = webView
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // DataDome JS нужно ~2-3 с после load для fingerprinting и записи cookie
        DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) { [weak self] in
            self?.extractCookie()
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        cleanup()
        call.reject("Navigation failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        cleanup()
        call.reject("Load failed: \(error.localizedDescription)")
    }

    private func extractCookie() {
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self = self else { return }

            let dd = cookies.first {
                $0.name == "datadome" &&
                ($0.domain == "soundcloud.com" || $0.domain == ".soundcloud.com")
            }

            DispatchQueue.main.async { self.cleanup() }

            if let dd = dd {
                self.call.resolve(["cookie": dd.value])
            } else {
                self.call.reject("datadome cookie not found — soundcloud.com may be unreachable")
            }
        }
    }

    private func cleanup() {
        webView?.removeFromSuperview()
        webView = nil
    }
}

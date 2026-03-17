import Foundation
import WebKit
import Capacitor

/// Делает HTTP запросы к api-v2.soundcloud.com через WKWebView (не URLSession).
/// URLSession блокируется DataDome по TLS/HTTP fingerprint даже при правильном cookie.
/// WKWebView имеет настоящий браузерный fingerprint — DataDome его пропускает.
@objc(NativeAPIPlugin)
public class NativeAPIPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "NativeAPIPlugin"
    public let jsName = "NativeAPI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "put",    returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "delete", returnType: CAPPluginReturnPromise),
    ]

    @objc func put(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.makeRequest(call, method: "PUT") }
    }

    @objc func delete(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.makeRequest(call, method: "DELETE") }
    }

    private func makeRequest(_ call: CAPPluginCall, method: String) {
        guard let path     = call.getString("path"),
              let clientId = call.getString("clientId") else {
            call.reject("Missing path or clientId"); return
        }
        let accessToken = call.getString("accessToken") ?? ""
        let ddCookie    = call.getString("ddCookie")    ?? ""
        let urlStr = "https://api-v2.soundcloud.com\(path)?client_id=\(clientId)"

        let launch = { WebViewAPIExecutor(call: call).run(urlStr: urlStr, method: method, accessToken: accessToken) }

        // Принудительно прописываем DataDome cookie в общее WKWebsiteDataStore
        // для .soundcloud.com — WKWebView отправит его автоматически (same-site запрос).
        guard !ddCookie.isEmpty,
              let cookie = HTTPCookie(properties: [
                  .name:   "datadome",
                  .value:  ddCookie,
                  .domain: ".soundcloud.com",
                  .path:   "/",
                  .secure: "TRUE",
              ]) else {
            launch(); return
        }
        WKWebsiteDataStore.default().httpCookieStore.setCookie(cookie) { launch() }
    }
}

// MARK: - WebViewAPIExecutor

private class WebViewAPIExecutor: NSObject, WKScriptMessageHandler, WKNavigationDelegate {

    private var call: CAPPluginCall
    private var webView: WKWebView!
    private var pendingJS: String?
    private var selfRef: WebViewAPIExecutor?   // удерживаем себя до завершения

    init(call: CAPPluginCall) {
        self.call = call
        super.init()
        selfRef = self
    }

    func run(urlStr: String, method: String, accessToken: String) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        config.userContentController.add(self, name: "apiResult")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self

        let safeToken = accessToken.replacingOccurrences(of: "'", with: "\\'")
        let safeUrl   = urlStr.replacingOccurrences(of: "'", with: "\\'")

        // JS выполняется с origin soundcloud.com → запрос к api-v2.soundcloud.com
        // является same-site → SameSite=Lax cookie передаётся, CORS разрешён.
        pendingJS = """
        fetch('\(safeUrl)', {
            method: '\(method)',
            headers: {
                'Authorization': 'OAuth \(safeToken)',
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        }).then(function(r) {
            if (r.status < 300 || r.status === 204 || r.status === 404) {
                window.webkit.messageHandlers.apiResult.postMessage({ok:1, status:r.status});
            } else {
                r.text().then(function(t) {
                    window.webkit.messageHandlers.apiResult.postMessage({ok:0, status:r.status, body:t});
                });
            }
        }).catch(function(e) {
            window.webkit.messageHandlers.apiResult.postMessage({ok:0, error:e.toString()});
        });
        """

        // baseURL = soundcloud.com: JS-origin совпадает с тем, что видит SoundCloud web app.
        // Сетевой запрос к soundcloud.com НЕ делается — только устанавливается origin для JS.
        webView.loadHTMLString("<html><body></body></html>",
                                baseURL: URL(string: "https://soundcloud.com")!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let js = pendingJS else { return }
        pendingJS = nil
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish { $0.reject("Navigation error: \(error.localizedDescription)") }
    }

    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        guard let d = message.body as? [String: Any] else { return }
        finish { call in
            if let ok = d["ok"] as? Int, ok == 1 {
                call.resolve(["status": d["status"] ?? 0])
            } else if let status = d["status"] as? Int, let body = d["body"] as? String {
                call.reject("HTTP \(status): \(body)")
            } else {
                call.reject(d["error"] as? String ?? "Unknown API error")
            }
        }
    }

    private func finish(block: (CAPPluginCall) -> Void) {
        guard selfRef != nil else { return }
        let c = call
        selfRef = nil
        block(c)
    }
}

import Foundation
import Capacitor

/// Делает HTTP запросы напрямую к api-v2.soundcloud.com через URLSession,
/// минуя Cloudflare Worker. URLSession не ограничен CORS и использует
/// реальный IP устройства — DataDome пропускает лучше, чем datacenter IP.
@objc(NativeAPIPlugin)
public class NativeAPIPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "NativeAPIPlugin"
    public let jsName = "NativeAPI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "put",    returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "delete", returnType: CAPPluginReturnPromise),
    ]

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 20
        cfg.httpShouldSetCookies = false
        return URLSession(configuration: cfg)
    }()

    @objc func put(_ call: CAPPluginCall) {
        makeRequest(call: call, method: "PUT")
    }

    @objc func delete(_ call: CAPPluginCall) {
        makeRequest(call: call, method: "DELETE")
    }

    private func makeRequest(call: CAPPluginCall, method: String) {
        guard let path     = call.getString("path"),
              let clientId = call.getString("clientId") else {
            call.reject("Missing path or clientId")
            return
        }

        let accessToken = call.getString("accessToken") ?? ""
        let ddCookie    = call.getString("ddCookie")    ?? ""

        var comps = URLComponents(string: "https://api-v2.soundcloud.com\(path)")!
        comps.queryItems = [URLQueryItem(name: "client_id", value: clientId)]
        guard let url = comps.url else {
            call.reject("Invalid URL")
            return
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json",     forHTTPHeaderField: "Content-Type")
        req.setValue("https://soundcloud.com",  forHTTPHeaderField: "Origin")
        req.setValue("https://soundcloud.com/", forHTTPHeaderField: "Referer")
        // iOS Safari UA — DataDome видит реальный мобильный браузер
        req.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            forHTTPHeaderField: "User-Agent"
        )
        if !accessToken.isEmpty {
            req.setValue("OAuth \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if !ddCookie.isEmpty {
            req.setValue("datadome=\(ddCookie)", forHTTPHeaderField: "Cookie")
        }

        session.dataTask(with: req) { data, response, error in
            if let error = error {
                call.reject("Request error: \(error.localizedDescription)")
                return
            }
            guard let http = response as? HTTPURLResponse else {
                call.reject("Invalid response")
                return
            }
            let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            if (200..<300).contains(http.statusCode) || http.statusCode == 404 {
                call.resolve(["status": http.statusCode])
            } else {
                call.reject("HTTP \(http.statusCode): \(String(body.prefix(400)))")
            }
        }.resume()
    }
}

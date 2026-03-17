import UIKit
import WebKit
import Capacitor

/// Решает DataDome challenge, показывая страницу капчи прямо в приложении.
/// DataDome fingerprints реальный WKWebView и либо auto-solve, либо показывает CAPTCHA.
/// После решения — перехватываем redirect, читаем cookie, закрываем WebView.
@objc(DataDomePlugin)
public class DataDomePlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "DataDomePlugin"
    public let jsName = "DataDome"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "solveCaptcha", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchCookie",  returnType: CAPPluginReturnPromise),
    ]

    @objc func solveCaptcha(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr) else {
            call.reject("Invalid URL")
            return
        }
        DispatchQueue.main.async {
            self.presentCaptchaVC(url: url, call: call)
        }
    }

    @objc func fetchCookie(_ call: CAPPluginCall) {
        guard let url = URL(string: "https://soundcloud.com") else { call.reject("Bad URL"); return }
        DispatchQueue.main.async {
            self.presentCaptchaVC(url: url, call: call)
        }
    }

    private func presentCaptchaVC(url: URL, call: CAPPluginCall) {
        guard let root = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow })?.rootViewController else {
            call.reject("No root view controller")
            return
        }
        let vc = CaptchaViewController(url: url) { result in
            switch result {
            case .success(let cookie): call.resolve(["cookie": cookie])
            case .failure(let e):     call.reject(e.localizedDescription)
            }
        }
        // Находим верхний VC для презентации
        var presenter = root
        while let p = presenter.presentedViewController { presenter = p }
        presenter.present(vc, animated: true)
    }
}

// MARK: - CaptchaViewController

class CaptchaViewController: UIViewController, WKNavigationDelegate {

    private let url: URL
    private let completion: (Result<String, Error>) -> Void
    private var webView: WKWebView!
    private var resolved = false

    init(url: URL, completion: @escaping (Result<String, Error>) -> Void) {
        self.url = url
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .pageSheet
    }
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.1, green: 0.1, blue: 0.1, alpha: 1)

        // Заголовок
        let titleLabel = UILabel()
        titleLabel.text = "Проверка безопасности"
        titleLabel.textColor = .white
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        // Кнопка отмены
        let cancelBtn = UIButton(type: .system)
        cancelBtn.setTitle("Отмена", for: .normal)
        cancelBtn.setTitleColor(.systemBlue, for: .normal)
        cancelBtn.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        cancelBtn.translatesAutoresizingMaskIntoConstraints = false

        let headerView = UIView()
        headerView.backgroundColor = UIColor(red: 0.12, green: 0.12, blue: 0.12, alpha: 1)
        headerView.translatesAutoresizingMaskIntoConstraints = false
        headerView.addSubview(titleLabel)
        headerView.addSubview(cancelBtn)

        // WKWebView — shared data store чтобы cookie попали в общее хранилище
        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.backgroundColor = .white

        view.addSubview(headerView)
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            headerView.heightAnchor.constraint(equalToConstant: 48),

            titleLabel.centerXAnchor.constraint(equalTo: headerView.centerXAnchor),
            titleLabel.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),

            cancelBtn.trailingAnchor.constraint(equalTo: headerView.trailingAnchor, constant: -16),
            cancelBtn.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),

            webView.topAnchor.constraint(equalTo: headerView.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        webView.load(URLRequest(url: url))
    }

    // MARK: - WKNavigationDelegate

    /// Когда DataDome auto-resolve срабатывает → редиректит на referer (api-v2.soundcloud.com).
    /// Перехватываем, читаем cookie, закрываем.
    func webView(_ webView: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let host = action.request.url?.host ?? ""
        let isCaptchaDomain = host.contains("datadome") || host.contains("captcha-delivery")
        let isBlank = host.isEmpty

        if !isCaptchaDomain && !isBlank {
            // Редирект на внешний домен → challenge решён
            decisionHandler(.cancel)
            finish()
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard !resolved else { return }
        finish() // попробуем прочитать cookie даже при ошибке загрузки
    }

    // MARK: - Private

    private func finish() {
        guard !resolved else { return }
        resolved = true

        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self = self else { return }

            // Ищем datadome cookie — домен может быть .soundcloud.com или captcha-delivery.com
            let dd = cookies.first(where: { $0.name == "datadome" })

            DispatchQueue.main.async {
                self.dismiss(animated: true) {
                    if let dd = dd {
                        self.completion(.success(dd.value))
                    } else {
                        self.completion(.failure(
                            NSError(domain: "DataDome", code: 0,
                                    userInfo: [NSLocalizedDescriptionKey: "datadome cookie not found after captcha"])
                        ))
                    }
                }
            }
        }
    }

    @objc private func cancel() {
        guard !resolved else { return }
        resolved = true
        dismiss(animated: true) {
            self.completion(.failure(
                NSError(domain: "DataDome", code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "Cancelled by user"])
            ))
        }
    }
}

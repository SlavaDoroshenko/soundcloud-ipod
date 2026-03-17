import UIKit
import WebKit
import Capacitor

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
            call.reject("Invalid URL"); return
        }
        DispatchQueue.main.async { self.present(url: url, call: call) }
    }

    @objc func fetchCookie(_ call: CAPPluginCall) {
        guard let url = URL(string: "https://soundcloud.com") else { call.reject("Bad URL"); return }
        DispatchQueue.main.async { self.present(url: url, call: call) }
    }

    private func present(url: URL, call: CAPPluginCall) {
        guard let root = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow })?.rootViewController else {
            call.reject("No root VC"); return
        }
        var top = root
        while let p = top.presentedViewController { top = p }
        let vc = CaptchaViewController(url: url) { result in
            switch result {
            case .success(let c): call.resolve(["cookie": c])
            case .failure(let e): call.reject(e.localizedDescription)
            }
        }
        top.present(vc, animated: true)
    }
}

// MARK: - CaptchaViewController

final class CaptchaViewController: UIViewController, WKNavigationDelegate {

    private let url: URL
    private let completion: (Result<String, Error>) -> Void
    private var webView: WKWebView!
    private var doneButton: UIButton!
    private var statusLabel: UILabel!
    private var resolved = false
    private var pollTimer: Timer?
    private var initialCookieValue: String?

    init(url: URL, completion: @escaping (Result<String, Error>) -> Void) {
        self.url = url
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .pageSheet
    }
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.08, green: 0.08, blue: 0.08, alpha: 1)
        buildUI()

        // Запоминаем текущее значение cookie ПЕРЕД загрузкой страницы
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { [weak self] cookies in
            self?.initialCookieValue = cookies.first(where: { $0.name == "datadome" })?.value
            DispatchQueue.main.async { self?.loadPage() }
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        pollTimer?.invalidate()
    }

    // MARK: - UI

    private func buildUI() {
        // Header
        let header = UIView()
        header.backgroundColor = UIColor(red: 0.12, green: 0.12, blue: 0.12, alpha: 1)
        header.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.text = "Проверка DataDome"
        title.textColor = .white
        title.font = .systemFont(ofSize: 15, weight: .semibold)
        title.translatesAutoresizingMaskIntoConstraints = false

        statusLabel = UILabel()
        statusLabel.text = "Решите капчу, затем нажмите «Готово»"
        statusLabel.textColor = UIColor(white: 0.6, alpha: 1)
        statusLabel.font = .systemFont(ofSize: 12)
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        doneButton = UIButton(type: .system)
        doneButton.setTitle("Готово", for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        doneButton.setTitleColor(.systemBlue, for: .normal)
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        doneButton.translatesAutoresizingMaskIntoConstraints = false

        let cancelBtn = UIButton(type: .system)
        cancelBtn.setTitle("Отмена", for: .normal)
        cancelBtn.setTitleColor(UIColor(white: 0.5, alpha: 1), for: .normal)
        cancelBtn.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        cancelBtn.translatesAutoresizingMaskIntoConstraints = false

        header.addSubview(title)
        header.addSubview(statusLabel)
        header.addSubview(doneButton)
        header.addSubview(cancelBtn)

        // WebView
        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(header)
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 64),

            cancelBtn.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 16),
            cancelBtn.centerYAnchor.constraint(equalTo: header.centerYAnchor, constant: 8),

            title.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            title.topAnchor.constraint(equalTo: header.topAnchor, constant: 12),

            statusLabel.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            statusLabel.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 2),

            doneButton.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -16),
            doneButton.centerYAnchor.constraint(equalTo: header.centerYAnchor, constant: 8),

            webView.topAnchor.constraint(equalTo: header.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func loadPage() {
        var req = URLRequest(url: url)
        req.timeoutInterval = 20
        webView.load(req)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Начинаем polling — проверяем cookie каждую секунду
        startPolling()
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let host = action.request.url?.host ?? ""
        let isCaptcha = host.contains("datadome") || host.contains("captcha-delivery") || host.isEmpty
        if !isCaptcha {
            // Redirect после auto-solve
            decisionHandler(.cancel)
            extractCookieAndFinish()
        } else {
            decisionHandler(.allow)
        }
    }

    // MARK: - Polling

    private func startPolling() {
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.checkCookie()
        }
    }

    private func checkCookie() {
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self = self, !self.resolved else { return }
            let dd = cookies.first(where: { $0.name == "datadome" })
            // Авто-финиш если cookie появился или изменился
            if let dd = dd, dd.value != self.initialCookieValue {
                self.pollTimer?.invalidate()
                DispatchQueue.main.async {
                    self.statusLabel.text = "✓ Проверено, закрываем..."
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self.finish(cookie: dd.value)
                }
            }
        }
    }

    // MARK: - Actions

    @objc private func doneTapped() {
        extractCookieAndFinish()
    }

    @objc private func cancel() {
        pollTimer?.invalidate()
        guard !resolved else { return }
        resolved = true
        dismiss(animated: true) {
            self.completion(.failure(NSError(domain: "DataDome", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Cancelled"])))
        }
    }

    // MARK: - Cookie extraction

    private func extractCookieAndFinish() {
        pollTimer?.invalidate()
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self = self else { return }
            if let dd = cookies.first(where: { $0.name == "datadome" }) {
                self.finish(cookie: dd.value)
            } else {
                DispatchQueue.main.async {
                    self.statusLabel.text = "Cookie не найден — попробуйте ещё раз"
                }
            }
        }
    }

    private func finish(cookie: String) {
        guard !resolved else { return }
        resolved = true
        pollTimer?.invalidate()
        DispatchQueue.main.async {
            self.dismiss(animated: true) {
                self.completion(.success(cookie))
            }
        }
    }
}

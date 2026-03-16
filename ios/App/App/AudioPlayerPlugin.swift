import Foundation
import AVFoundation
import MediaPlayer
import Capacitor

/// Singleton AVPlayer для бесконечного фонового воспроизведения.
/// HTML5 <audio> в WKWebView замерзает при заблокированном экране после ~10 мин.
/// AVPlayer работает независимо от WebView и не имеет этого ограничения.
@objc(AudioPlayerPlugin)
public class AudioPlayerPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "AudioPlayerPlugin"
    public let jsName = "AudioPlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "load",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState",    returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "skipToNext",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "skipToPrev",  returnType: CAPPluginReturnPromise),
    ]

    /// Доступен другим плагинам (LockScreenPlugin) для общего player state.
    static weak var shared: AudioPlayerPlugin?

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var statusObserver: NSKeyValueObservation?
    private var endObserver: NSObjectProtocol?

    // MARK: - Lifecycle

    public override func load() {
        AudioPlayerPlugin.shared = self
        configureAudioSession()
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            print("[AudioPlayerPlugin] AVAudioSession error: \(error)")
        }
    }

    // MARK: - Plugin methods

    /// load(url: String, trackInfo?: object)
    @objc func load(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString) else {
            call.reject("url is required and must be valid")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.teardownObservers()

            let item = AVPlayerItem(url: url)

            if let existing = self.player {
                existing.replaceCurrentItem(with: item)
            } else {
                self.player = AVPlayer(playerItem: item)
                self.player?.automaticallyWaitsToMinimizeStalling = true
            }

            self.setupObservers(for: item)
            call.resolve(["loaded": true])
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.player?.play()
            self?.emitStateChange()
            call.resolve()
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.player?.pause()
            self?.emitStateChange()
            call.resolve()
        }
    }

    /// seek(position: Double) — seconds
    @objc func seek(_ call: CAPPluginCall) {
        guard let position = call.getDouble("position") else {
            call.reject("position is required")
            return
        }
        DispatchQueue.main.async { [weak self] in
            let time = CMTime(seconds: position, preferredTimescale: 600)
            self?.player?.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
                self?.emitStateChange()
                call.resolve()
            }
        }
    }

    /// setVolume(volume: Float) — 0.0..1.0
    @objc func setVolume(_ call: CAPPluginCall) {
        let volume = call.getFloat("volume") ?? 1.0
        DispatchQueue.main.async { [weak self] in
            self?.player?.volume = max(0, min(1, volume))
            call.resolve()
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            call.resolve(self?.currentStateDict() ?? [
                "isPlaying": false, "currentTime": 0.0,
                "duration": 0.0, "volume": 1.0
            ])
        }
    }

    /// skipToNext / skipToPrev — уведомляет JS, который управляет очередью
    @objc func skipToNext(_ call: CAPPluginCall) {
        notifyListeners("nextTrack", data: [:])
        call.resolve()
    }

    @objc func skipToPrev(_ call: CAPPluginCall) {
        notifyListeners("prevTrack", data: [:])
        call.resolve()
    }

    // MARK: - Helpers

    private func setupObservers(for item: AVPlayerItem) {
        // Периодическое обновление прогресса (каждые 0.5 с)
        timeObserver = player?.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self, let item = self.player?.currentItem else { return }
            let duration = item.duration.seconds
            let current  = time.seconds
            if current.isNaN || duration.isNaN { return }
            let safeDuration = duration.isInfinite ? 0.0 : duration
            self.notifyListeners("progress", data: [
                "currentTime": current,
                "duration": safeDuration,
                "isPlaying": self.player?.rate != 0,
            ])
            // Обновляем тайм-код на экране блокировки напрямую из Swift.
            // JS не может делать это когда экран заблокирован (WKWebView замерзает).
            if var info = MPNowPlayingInfoCenter.default().nowPlayingInfo {
                info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = current
                if safeDuration > 0 {
                    info[MPMediaItemPropertyPlaybackDuration] = safeDuration
                }
                info[MPNowPlayingInfoPropertyPlaybackRate] = self.player?.rate != 0 ? 1.0 : 0.0
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        }

        // KVO статус — ready / failed
        statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async {
                switch item.status {
                case .readyToPlay:
                    let dur = item.duration.seconds
                    let safeDur = (dur.isNaN || dur.isInfinite) ? 0.0 : dur
                    self?.notifyListeners("ready", data: ["duration": safeDur])
                    // Сразу прописываем реальный duration на экране блокировки
                    if safeDur > 0, var info = MPNowPlayingInfoCenter.default().nowPlayingInfo {
                        info[MPMediaItemPropertyPlaybackDuration] = safeDur
                        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
                    }
                case .failed:
                    self?.notifyListeners("error", data: [
                        "message": item.error?.localizedDescription ?? "Playback error"
                    ])
                default: break
                }
            }
        }

        // Конец трека
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item, queue: .main
        ) { [weak self] _ in
            self?.notifyListeners("trackEnded", data: [:])
        }
    }

    private func teardownObservers() {
        if let obs = timeObserver { player?.removeTimeObserver(obs) }
        timeObserver = nil
        statusObserver?.invalidate()
        statusObserver = nil
        if let obs = endObserver { NotificationCenter.default.removeObserver(obs) }
        endObserver = nil
    }

    func currentStateDict() -> [String: Any] {
        let item = player?.currentItem
        let dur  = item?.duration.seconds ?? 0
        let cur  = player?.currentTime().seconds ?? 0
        return [
            "isPlaying":   player?.rate != 0,
            "currentTime": cur.isNaN  ? 0.0 : cur,
            "duration":    (dur.isNaN || dur.isInfinite) ? 0.0 : dur,
            "volume":      player?.volume ?? 1.0,
        ]
    }

    private func emitStateChange() {
        notifyListeners("stateChanged", data: currentStateDict())
    }

    deinit {
        teardownObservers()
    }
}

import Foundation
import MediaPlayer
import Capacitor

/// Управляет экраном блокировки iOS:
/// - MPNowPlayingInfoCenter — метаданные (обложка, название, прогресс)
/// - MPRemoteCommandCenter — кнопки (play/pause/next/prev/seek/like)
///
/// likeCommand появляется только если передан MPNowPlayingInfoPropertyDefaultPlaybackRate = 1.0
@objc(LockScreenPlugin)
public class LockScreenPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "LockScreenPlugin"
    public let jsName = "LockScreen"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateNowPlaying", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLiked",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear",            returnType: CAPPluginReturnPromise),
    ]

    private var artworkTask: URLSessionDataTask?

    // MARK: - Lifecycle

    public override func load() {
        setupRemoteCommandCenter()
    }

    private func setupRemoteCommandCenter() {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.isEnabled = true
        center.playCommand.addTarget { [weak self] _ in
            self?.notifyListeners("remotePlay", data: [:])
            return .success
        }

        center.pauseCommand.isEnabled = true
        center.pauseCommand.addTarget { [weak self] _ in
            self?.notifyListeners("remotePause", data: [:])
            return .success
        }

        center.nextTrackCommand.isEnabled = true
        center.nextTrackCommand.addTarget { [weak self] _ in
            self?.notifyListeners("remoteNext", data: [:])
            return .success
        }

        center.previousTrackCommand.isEnabled = true
        center.previousTrackCommand.addTarget { [weak self] _ in
            self?.notifyListeners("remotePrev", data: [:])
            return .success
        }

        center.changePlaybackPositionCommand.isEnabled = true
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.notifyListeners("remoteSeek", data: ["position": e.positionTime])
            return .success
        }

        // ❤️ Like — появляется на экране блокировки и в AirPlay
        // ВАЖНО: likeCommand работает только при наличии DefaultPlaybackRate в nowPlayingInfo
        center.likeCommand.isEnabled = true
        center.likeCommand.localizedTitle = "Like"
        center.likeCommand.addTarget { [weak self] _ in
            self?.notifyListeners("remoteLike", data: [:])
            return .success
        }

        // Отключаем неиспользуемые команды
        center.dislikeCommand.isEnabled = false
        center.bookmarkCommand.isEnabled = false
        center.ratingCommand.isEnabled = false
    }

    // MARK: - Plugin methods

    /// updateNowPlaying(title, artist, duration, currentTime, isPlaying, artworkUrl?, isLiked?)
    @objc func updateNowPlaying(_ call: CAPPluginCall) {
        let title       = call.getString("title")       ?? ""
        let artist      = call.getString("artist")      ?? ""
        let duration    = call.getDouble("duration")    ?? 0
        let currentTime = call.getDouble("currentTime") ?? 0
        let isPlaying   = call.getBool("isPlaying")     ?? false
        let artworkUrl  = call.getString("artworkUrl")
        let isLiked     = call.getBool("isLiked")       ?? false

        DispatchQueue.main.async { [weak self] in
            var info: [String: Any] = [
                MPMediaItemPropertyTitle:                      title,
                MPMediaItemPropertyArtist:                     artist,
                MPNowPlayingInfoPropertyElapsedPlaybackTime:   currentTime,
                MPMediaItemPropertyPlaybackDuration:           duration,
                MPNowPlayingInfoPropertyPlaybackRate:          isPlaying ? 1.0 : 0.0,
                // КРИТИЧНО: без этого likeCommand не появляется на экране блокировки
                MPNowPlayingInfoPropertyDefaultPlaybackRate:   1.0,
            ]

            MPRemoteCommandCenter.shared().likeCommand.isActive = isLiked
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info

            // Загружаем обложку асинхронно, не блокируя resolve
            if let urlStr = artworkUrl, let url = URL(string: urlStr) {
                self?.artworkTask?.cancel()
                self?.artworkTask = URLSession.shared.dataTask(with: url) { data, _, _ in
                    guard let data, let image = UIImage(data: data) else { return }
                    let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                    DispatchQueue.main.async {
                        var updated = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                        updated[MPMediaItemPropertyArtwork] = artwork
                        MPNowPlayingInfoCenter.default().nowPlayingInfo = updated
                    }
                }
                self?.artworkTask?.resume()
            }

            call.resolve()
        }
    }

    /// setLiked(isLiked: Bool) — обновляет состояние кнопки ❤️ без полного обновления
    @objc func setLiked(_ call: CAPPluginCall) {
        let isLiked = call.getBool("isLiked") ?? false
        DispatchQueue.main.async {
            MPRemoteCommandCenter.shared().likeCommand.isActive = isLiked
            call.resolve()
        }
    }

    /// clear — убирает метаданные с экрана блокировки
    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            call.resolve()
        }
    }
}

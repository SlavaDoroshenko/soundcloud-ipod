import UIKit
import Capacitor

/// Subclass CAPBridgeViewController to explicitly register inline plugins.
/// Capacitor 6 auto-discovers plugins only in SPM packages, not in app target.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AudioPlayerPlugin())
        bridge?.registerPluginInstance(LockScreenPlugin())
        bridge?.registerPluginInstance(DataDomePlugin())
        bridge?.registerPluginInstance(NativeAPIPlugin())
    }
}

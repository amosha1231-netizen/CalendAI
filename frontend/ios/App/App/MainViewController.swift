import UIKit
import Capacitor

/// Bridge view controller that registers the app's own (non-npm) plugins.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SignInWithApplePlugin())
    }
}

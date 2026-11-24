import UIKit
import Capacitor

/// The app's bridge view controller. Registers plugins that live inside this
/// app target instead of an npm package (currently: Sign in with Apple).
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
    }
}

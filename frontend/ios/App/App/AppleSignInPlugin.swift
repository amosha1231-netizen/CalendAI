import Foundation
import UIKit
import Capacitor
import AuthenticationServices
import CryptoKit

/// Sign in with Apple, using Apple's own native sheet.
///
/// JS side: frontend/src/utils/appleSignIn.js calls `AppleSignIn.authorize({ nonce })`.
/// We send Apple sha256(nonce); the server checks Apple's token carries the same hash.
/// Registered in AppViewController (this app's bridge view controller).
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            call.reject("Missing nonce")
            return
        }
        if let previous = pendingCall {
            previous.reject("Superseded", "canceled")
        }
        pendingCall = call

        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        let hashed = SHA256.hash(data: Data(nonce.utf8))
        request.nonce = hashed.map { String(format: "%02x", $0) }.joined()

        DispatchQueue.main.async {
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("No identity token", "failed")
            return
        }
        var code = ""
        if let codeData = credential.authorizationCode, let codeString = String(data: codeData, encoding: .utf8) {
            code = codeString
        }
        call.resolve([
            "identityToken": identityToken,
            "authorizationCode": code,
            "user": credential.user,
            "email": credential.email ?? "",
            "givenName": credential.fullName?.givenName ?? "",
            "familyName": credential.fullName?.familyName ?? ""
        ])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("Canceled", "canceled")
        } else {
            call.reject(error.localizedDescription, "failed")
        }
    }
}

import Foundation
import Security
import Capacitor
import AppIntents

// Siri, built into the app: "Hey Siri, add an event in CalendAI".
//
// Siri asks what to add, the user says it in their own words, and the app sends
// the sentence to the backend (POST /api/events/siri), which creates the event
// in the user's CalendAI calendar and returns a sentence for Siri to say.
// Because the phrase names the app, Siri runs this app's action instead of
// guessing at Apple's or Google's calendar. Nothing to install or paste:
// the web app hands the device its own key after sign-in (CalendAISiriPlugin).

// MARK: - Key storage (Keychain)

enum SiriKeyStore {
    struct Entry: Codable {
        let key: String
        let endpoint: String
        let userId: String
    }

    private static let baseQuery: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.amos.calendai.siri",
        kSecAttrAccount as String: "app-key"
    ]

    static func load() -> Entry? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(Entry.self, from: data)
    }

    @discardableResult
    static func save(_ entry: Entry) -> Bool {
        guard let data = try? JSONEncoder().encode(entry) else { return false }
        clear()
        var attributes = baseQuery
        attributes[kSecValueData as String] = data
        // Siri can run the action while the phone is locked, after the first unlock.
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess
    }

    static func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}

// MARK: - Bridge to the web app: `CalendAISiri.status() / setKey() / clearKey()`

@objc(CalendAISiriPlugin)
public class CalendAISiriPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CalendAISiriPlugin"
    public let jsName = "CalendAISiri"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearKey", returnType: CAPPluginReturnPromise)
    ]

    @objc func status(_ call: CAPPluginCall) {
        let entry = SiriKeyStore.load()
        call.resolve([
            "hasKey": entry != nil,
            "userId": entry?.userId ?? ""
        ])
    }

    @objc func setKey(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty,
              let endpoint = call.getString("endpoint"), URL(string: endpoint) != nil else {
            call.reject("key and endpoint are required", "bad_args")
            return
        }
        let entry = SiriKeyStore.Entry(key: key, endpoint: endpoint, userId: call.getString("userId") ?? "")
        if SiriKeyStore.save(entry) {
            call.resolve(["ok": true])
        } else {
            call.reject("Could not save the Siri key", "keychain")
        }
    }

    /// Forgets the key on this device and hands it back so the web app can revoke it.
    @objc func clearKey(_ call: CAPPluginCall) {
        let previous = SiriKeyStore.load()
        SiriKeyStore.clear()
        call.resolve(["key": previous?.key ?? ""])
    }
}

// MARK: - The Siri action

@available(iOS 16.0, *)
struct AddEventIntent: AppIntent {
    static let title: LocalizedStringResource = "Add to CalendAI"
    static let openAppWhenRun: Bool = false

    @Parameter(title: "What to add", requestValueDialog: IntentDialog("What should I add?"))
    var text: String

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        guard let entry = SiriKeyStore.load(), let url = URL(string: entry.endpoint) else {
            let message = String(localized: "Open CalendAI and sign in once, then ask me again.")
            return .result(value: message, dialog: "\(message)")
        }

        var request = URLRequest(url: url, timeoutInterval: 50)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(entry.key, forHTTPHeaderField: "X-CalendAI-Key")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["text": text])

        var reply = ""
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            reply = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        } catch {
            reply = String(localized: "I couldn't reach CalendAI. Check the internet connection and try again.")
        }
        if reply.isEmpty || reply.hasPrefix("<") || reply.hasPrefix("{") {
            reply = String(localized: "Something went wrong. Please try again in a moment.")
        }
        return .result(value: reply, dialog: "\(reply)")
    }
}

// Phrases Siri listens for. Each must contain the app name; Hebrew versions are
// in he.lproj/AppShortcuts.strings. Extra spoken names (קלנדאי, Calend AI) are
// INAlternativeAppNames in Info.plist.
@available(iOS 16.0, *)
struct CalendAIShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddEventIntent(),
            phrases: [
                "Add an event in \(.applicationName)",
                "Add an event with \(.applicationName)",
                "Add to \(.applicationName)",
                "New event in \(.applicationName)",
                "Schedule in \(.applicationName)",
                "Write in \(.applicationName)",
                "\(.applicationName) add an event",
                "\(.applicationName) new event"
            ]
        )
    }
}

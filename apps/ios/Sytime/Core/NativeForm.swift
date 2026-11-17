import SwiftUI

struct FormField: Identifiable {
  enum Kind {
    case text, multiline, password, integer, decimal, toggle
    case choice([(String, String)])
  }
  let id: String
  let title: String
  var kind: Kind = .text
  var required = true
  var maxLength: Int? = nil
  var help: String? = nil
  var visibleWhen: (([String: String]) -> Bool)? = nil
  var onChange: ((inout [String: String], String) -> Void)? = nil
  init(
    _ id: String, _ title: String, _ kind: Kind = .text, required: Bool = true, max: Int? = nil,
    help: String? = nil, visibleWhen: (([String: String]) -> Bool)? = nil,
    onChange: ((inout [String: String], String) -> Void)? = nil
  ) {
    self.id = id
    self.title = title
    self.kind = kind
    self.required = required
    maxLength = max
    self.help = help
    self.visibleWhen = visibleWhen
    self.onChange = onChange
  }
}

struct FormFields: View {
  let fields: [FormField]
  @Binding var values: [String: String]
  var body: some View {
    ForEach(fields.filter { $0.visibleWhen?(values) ?? true }) { field in
      VStack(alignment: .leading, spacing: 6) {
        let binding = Binding(
          get: { values[field.id] ?? "" },
          set: { value in
            var updated = values
            updated[field.id] = value
            field.onChange?(&updated, value)
            values = updated
          })
        switch field.kind {
        case .password:
          SecureField(field.title, text: binding).textContentType(
            field.id == "oldPassword" || field.id == "password" ? .password : .newPassword)
        case .integer: TextField(field.title, text: binding).keyboardType(.numberPad)
        case .decimal: TextField(field.title, text: binding).keyboardType(.decimalPad)
        case .toggle:
          Toggle(
            field.title,
            isOn: Binding(
              get: { values[field.id] == "1" }, set: { values[field.id] = $0 ? "1" : "0" }))
        case .choice(let choices):
          Picker(field.title, selection: binding) {
            ForEach(choices, id: \.0) { Text($0.1).tag($0.0) }
          }
        case .multiline: TextField(field.title, text: binding, axis: .vertical).lineLimit(3...10)
        case .text:
          TextField(field.title, text: binding).textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
        if let help = field.help { Text(help).font(.caption).foregroundStyle(.secondary) }
        if let limit = field.maxLength, (values[field.id]?.count ?? 0) > limit {
          Text("最多 \(limit) 字").font(.caption).foregroundStyle(.red)
        }
      }
    }
  }
}

struct NativeForm: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  let title: String
  let path: String
  var method = "POST"
  var fields: [FormField] = []
  var initial: [String: String] = [:]
  var fixed: [String: JSONValue] = [:]
  var explanation: String?
  var success = "已保存"
  var confirmation: String?
  var coordinatePreview = false
  var photoField: String?
  var multipart = false
  var onSaved: (() -> Void)?
  @State private var values: [String: String] = [:]
  @State private var image: Data?
  @State private var saving = false
  @State private var error: String?
  @State private var confirm = false
  @State private var discard = false
  @State private var initialized = false
  var body: some View {
    Form {
      if let explanation { Section { Text(explanation).foregroundStyle(.secondary) } }
      Section { FormFields(fields: fields, values: $values) }
      if coordinatePreview, let lat = Double(values["lat"] ?? ""),
        let lng = Double(values["lng"] ?? ""), (-90...90).contains(lat), (-180...180).contains(lng)
      {
        Section("位置预览") {
          ShopsMap(shops: [
            .object([
              "id": .number(0), "name": .string(values["name"] ?? "推荐位置"), "lat": .number(lat),
              "lng": .number(lng),
            ])
          ]).frame(height: 240)
          Text("已将 GCJ-02 坐标转换为地图位置，请核对门牌与步行路线。").font(.caption).foregroundStyle(.secondary)
        }
      }
      if photoField != nil { Section("图片") { PhotoField(data: $image) } }
      if let error { Section { Text(error).foregroundStyle(.red) } }
      if fields.isEmpty && photoField == nil { Section { Text(confirmation ?? "请选择提交以继续。") } }
    }
    .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button("取消") { if values != initial || image != nil { discard = true } else { dismiss() } }
          .disabled(saving)
      }
      ToolbarItem(placement: .confirmationAction) {
        Button(saving ? "提交中…" : "提交") {
          if confirmation != nil { confirm = true } else { Task { await save() } }
        }.disabled(saving || !initialized)
      }
    }
    .interactiveDismissDisabled(values != initial || image != nil || saving)
    .confirmationDialog(confirmation ?? "确认提交？", isPresented: $confirm, titleVisibility: .visible) {
      Button("确认提交", role: .destructive) { Task { await save() } }
    }
    .confirmationDialog("放弃本次修改？", isPresented: $discard, titleVisibility: .visible) {
      Button("放弃修改", role: .destructive) { dismiss() }
    }
    .task {
      if !initialized {
        values = initial
        initialized = true
      }
    }
  }
  private func save() async {
    var body = fixed
    for field in fields where (field.visibleWhen?(values) ?? true) {
      let value = values[field.id] ?? ""
      if field.required && value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        error = "请填写\(field.title)"
        return
      }
      if let max = field.maxLength, value.count > max {
        error = "\(field.title)最多 \(max) 字"
        return
      }
      switch field.kind {
      case .integer, .decimal:
        if value.isEmpty && !field.required { continue }
        guard let n = Double(value), n.isFinite, n >= 0 else {
          error = "\(field.title)须为非负数字"
          return
        }
        if case .integer = field.kind, n.rounded() != n {
          error = "\(field.title)须为整数"
          return
        }
        body[field.id] = .number(n)
      case .toggle: body[field.id] = .number(value == "1" ? 1 : 0)
      default: body[field.id] = .string(value)
      }
    }
    if path.hasPrefix("/api/admin/wiki/folders"), let parent = Int(values["parent_id"] ?? "") {
      body["parent_id"] = parent == 0 ? .null : .number(Double(parent))
    }
    if let newPassword = values["newPassword"] {
      guard PasswordRules.valid(newPassword) else {
        error = PasswordRules.explanation
        return
      }
      if values["confirmPassword"] != newPassword {
        error = "两次输入的密码不一致"
        return
      }
      body.removeValue(forKey: "confirmPassword")
    }
    if photoField == "avatar" && image == nil {
      error = "请先选择头像图片"
      return
    }
    saving = true
    error = nil
    defer { saving = false }
    do {
      let value: JSONValue
      if multipart || photoField != nil {
        value = try await app.api.upload(
          path, fields: body.mapValues(\.string), image: image, imageField: photoField ?? "image",
          method: method)
      } else {
        value = try await app.api.request(path, method: method, body: .object(body))
      }
      if value["reauthenticate"].flag || path == "/api/user/sessions/revoke" { app.clearSession() }
      onSaved?()
      dismiss()
      app.notice = success
    } catch { self.error = error.localizedDescription }
  }
}

enum PasswordRules {
  static let explanation = "密码须至少 8 个字符且不超过 72 个 UTF-8 字节，包含大小写字母和数字，首尾不能有空白。"
  static func valid(_ s: String) -> Bool {
    s.count >= 8 && s.utf8.count <= 72 && s == s.trimmingCharacters(in: .whitespacesAndNewlines)
      && s.range(of: "[A-Z]", options: .regularExpression) != nil
      && s.range(of: "[a-z]", options: .regularExpression) != nil
      && s.range(of: "[0-9]", options: .regularExpression) != nil
  }
}

struct FormPresentation: Identifiable {
  let id = UUID()
  let title: String
  let path: String
  var method = "POST"
  var fields: [FormField] = []
  var initial: [String: String] = [:]
  var fixed: [String: JSONValue] = [:]
  var explanation: String?
  var success = "已保存"
  var confirmation: String?
  var coordinatePreview = false
  var photoField: String?
  var multipart = false
  func view(onSaved: (() -> Void)? = nil) -> some View {
    NavigationStack {
      NativeForm(
        title: title, path: path, method: method, fields: fields, initial: initial, fixed: fixed,
        explanation: explanation, success: success, confirmation: confirmation,
        coordinatePreview: coordinatePreview, photoField: photoField, multipart: multipart,
        onSaved: onSaved)
    }
  }
}

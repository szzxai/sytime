import SwiftUI

struct MarkdownBlock: Identifiable {
  enum Kind {
    case heading(Int)
    case paragraph
    case code(String)
    case quote
    case list(String)
    case table([[String]])
    case image(String, String)
    case note(String)
    case details(String)
    case rule
  }
  let id: Int
  let text: String
  let kind: Kind
}

enum NativeMarkdown {
  static func blocks(_ source: String) -> [MarkdownBlock] {
    let lines = source.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
    var result: [MarkdownBlock] = []
    var i = 0
    while i < lines.count {
      let line = lines[i]
      let t = line.trimmingCharacters(in: .whitespaces)
      if t.isEmpty {
        i += 1
        continue
      }
      let start = i
      if t.hasPrefix("```") || t.hasPrefix("~~~") {
        let delimiter = String(t.prefix(3))
        let language = String(t.dropFirst(3))
        i += 1
        var code: [String] = []
        while i < lines.count && !lines[i].hasPrefix(delimiter) {
          code.append(lines[i])
          i += 1
        }
        result.append(.init(id: start, text: code.joined(separator: "\n"), kind: .code(language)))
        i += 1
        continue
      }
      if t.hasPrefix(":::") || t.hasPrefix("!!! ") || t.hasPrefix("??? ") {
        let folded = t.hasPrefix("???") || t.hasPrefix(":::details")
        let quoted = t.components(separatedBy: "\"")
        let title = quoted.count > 1 ? quoted[1] : folded ? "展开阅读" : "提示"
        let directive = t.hasPrefix(":::")
        i += 1
        var body: [String] = []
        while i < lines.count
          && (directive
            ? lines[i].trimmingCharacters(in: .whitespaces) != ":::"
            : (lines[i].hasPrefix("    ") || lines[i].hasPrefix("\t") || lines[i].isEmpty))
        {
          body.append(
            directive ? lines[i] : String(lines[i].dropFirst(lines[i].hasPrefix("\t") ? 1 : 4)))
          i += 1
        }
        if directive && i < lines.count { i += 1 }
        result.append(
          .init(
            id: start, text: body.joined(separator: "\n"),
            kind: folded ? .details(title) : .note(title)))
        continue
      }
      if let r = t.range(
        of: #"^!\[([^\]]*)\]\((/api/wiki/images/[a-f0-9-]+)\)$"#, options: .regularExpression)
      {
        let image = String(t[r])
        let alt = image.components(separatedBy: "](")[0].dropFirst(2)
        let path = image.components(separatedBy: "](")[1].dropLast()
        result.append(.init(id: start, text: "", kind: .image(String(path), String(alt))))
        i += 1
        continue
      }
      let level = t.prefix { $0 == "#" }.count
      if (1...6).contains(level), t.dropFirst(level).hasPrefix(" ") {
        result.append(.init(id: start, text: String(t.dropFirst(level + 1)), kind: .heading(level)))
        i += 1
        continue
      }
      if ["---", "***", "___"].contains(t) {
        result.append(.init(id: start, text: "", kind: .rule))
        i += 1
        continue
      }
      if i + 1 < lines.count, line.contains("|"),
        lines[i + 1].range(of: #"^\s*\|?\s*:?-{3,}"#, options: .regularExpression) != nil
      {
        var rows = [cells(line)]
        i += 2
        while i < lines.count && lines[i].contains("|") && !lines[i].isEmpty {
          rows.append(cells(lines[i]))
          i += 1
        }
        result.append(.init(id: start, text: "", kind: .table(rows)))
        continue
      }
      if t.hasPrefix(">") {
        result.append(
          .init(
            id: start, text: String(t.dropFirst()).trimmingCharacters(in: .whitespaces),
            kind: .quote))
        i += 1
        continue
      }
      if let r = t.range(of: #"^(?:[-*+] |\d+\. )"#, options: .regularExpression) {
        let marker = String(t[r])
        let text = String(t[r.upperBound...])
        let checked = text.hasPrefix("[x] ") || text.hasPrefix("[X] ")
        if text.hasPrefix("[ ] ") || checked {
          result.append(
            .init(id: start, text: String(text.dropFirst(4)), kind: .list(checked ? "☑" : "☐")))
        } else {
          result.append(
            .init(id: start, text: text, kind: .list(marker.first?.isNumber == true ? marker : "•"))
          )
        }
        i += 1
        continue
      }
      result.append(.init(id: start, text: t, kind: .paragraph))
      i += 1
    }
    return result
  }
  private static func cells(_ line: String) -> [String] {
    var cells = line.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
    if cells.first == "" { cells.removeFirst() }
    if cells.last == "" { cells.removeLast() }
    return cells
  }
  static func inline(_ source: String, baseURL: URL?) -> AttributedString {
    let pattern = #"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]"#
    var text = source
    if let regex = try? NSRegularExpression(pattern: pattern) {
      for match in regex.matches(in: source, range: NSRange(source.startIndex..., in: source))
        .reversed()
      {
        guard let range = Range(match.range, in: source),
          let targetRange = Range(match.range(at: 1), in: source)
        else { continue }
        let target = String(source[targetRange])
        let label = Range(match.range(at: 2), in: source).map { String(source[$0]) } ?? target
        let path = APIClient.path("/wiki.html", query: [Int(target) == nil ? "q" : "id": target])
        text.replaceSubrange(range, with: "[\(label)](\(path))")
      }
    }
    return
      (try? AttributedString(
        markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace),
        baseURL: baseURL)) ?? AttributedString(text)
  }
}

struct NativeMarkdownView: View {
  @Environment(AppModel.self) private var app
  let source: String
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      ForEach(NativeMarkdown.blocks(source)) { block in
        blockView(block).id("section-\(block.id + 1)")
      }
    }.frame(maxWidth: .infinity, alignment: .leading)
      .textSelection(.enabled)
      .environment(
        \.openURL,
        OpenURLAction { url in
          if url.host == app.api.baseURL?.host || url.scheme == "sytime" || url.host == nil,
            let route = AppRoute.parse(url)
          {
            app.pendingRoute = route
            return .handled
          }
          return ["https", "http"].contains(url.scheme ?? "") ? .systemAction : .discarded
        })
  }
  @ViewBuilder private func blockView(_ b: MarkdownBlock) -> some View {
    switch b.kind {
    case .heading(let level):
      Text(NativeMarkdown.inline(b.text, baseURL: app.api.baseURL)).font(
        level == 1 ? .title.bold() : level == 2 ? .title2.bold() : .headline
      ).padding(.top, 8).accessibilityAddTraits(.isHeader)
    case .paragraph: Text(NativeMarkdown.inline(b.text, baseURL: app.api.baseURL)).lineSpacing(5)
    case .quote:
      Text(NativeMarkdown.inline(b.text, baseURL: app.api.baseURL)).foregroundStyle(.secondary)
        .padding(.leading, 14).overlay(alignment: .leading) {
          Rectangle().fill(.tint.opacity(0.5)).frame(width: 3)
        }
    case .list(let marker):
      HStack(alignment: .top, spacing: 10) {
        Text(marker).foregroundStyle(.secondary)
        Text(NativeMarkdown.inline(b.text, baseURL: app.api.baseURL))
      }
    case .code(let language):
      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Text(language).font(.caption).foregroundStyle(.secondary)
          Spacer()
          Button("复制代码", systemImage: "doc.on.doc") {
            UIPasteboard.general.string = b.text
            app.notice = "代码已复制"
          }.font(.caption)
        }
        ScrollView(.horizontal) {
          Text(b.text).font(.system(.callout, design: .monospaced)).fixedSize(
            horizontal: true, vertical: false)
        }
      }.padding().background(.quaternary, in: .rect(cornerRadius: 14))
    case .image(let path, let alt):
      VStack(alignment: .leading) {
        RemotePicture(path: path, fit: true, label: alt).frame(maxHeight: 420)
        if !alt.isEmpty { Text(alt).font(.caption).foregroundStyle(.secondary) }
      }
    case .table(let rows):
      ScrollView(.horizontal) {
        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 12) {
          ForEach(rows.indices, id: \.self) { index in
            GridRow {
              ForEach(rows[index].indices, id: \.self) { column in
                Text(NativeMarkdown.inline(rows[index][column], baseURL: app.api.baseURL))
                  .fontWeight(index == 0 ? .semibold : .regular).frame(
                    minWidth: 100, maxWidth: 300, alignment: .leading)
              }
            }
            Divider()
          }
        }.padding()
      }.background(.quaternary.opacity(0.4), in: .rect(cornerRadius: 12)).accessibilityLabel("表格")
    case .details(let title):
      DisclosureGroup(title) { AnyView(NativeMarkdownView(source: b.text)).padding(.top, 10) }
        .padding().background(.quaternary.opacity(0.4), in: .rect(cornerRadius: 14))
    case .note(let title):
      VStack(alignment: .leading, spacing: 10) {
        Label(title, systemImage: "info.circle").font(.headline)
        AnyView(NativeMarkdownView(source: b.text))
      }.padding().background(.tint.opacity(0.08), in: .rect(cornerRadius: 14))
    case .rule: Divider()
    }
  }
}

struct NativeTextDiff: View {
  let before: String
  let after: String
  var body: some View {
    let old = before.components(separatedBy: "\n")
    let new = after.components(separatedBy: "\n")
    let changes = new.difference(from: old)
    VStack(alignment: .leading, spacing: 8) {
      Text("− 删除的行 · + 新增的行").font(.caption).foregroundStyle(.secondary)
      if changes.isEmpty { Text("正文没有变化").foregroundStyle(.secondary) }
      ForEach(Array(changes.enumerated()), id: \.offset) { _, change in
        switch change {
        case .remove(let offset, let text, _):
          Text("− \(offset + 1)  \(text)").foregroundStyle(.red).frame(
            maxWidth: .infinity, alignment: .leading
          ).padding(6).background(.red.opacity(0.06))
        case .insert(let offset, let text, _):
          Text("+ \(offset + 1)  \(text)").foregroundStyle(.green).frame(
            maxWidth: .infinity, alignment: .leading
          ).padding(6).background(.green.opacity(0.06))
        }
      }
    }.font(.system(.footnote, design: .monospaced)).textSelection(.enabled)
  }
}

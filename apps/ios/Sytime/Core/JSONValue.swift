import Foundation

/// Heterogeneous API envelopes retain null and numeric types across native forms.
enum JSONValue: Codable, Equatable, Hashable, Sendable, Identifiable {
  case object([String: JSONValue])
  case array([JSONValue])
  case string(String)
  case number(Double)
  case bool(Bool)
  case null

  init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() {
      self = .null
    } else if let v = try? c.decode(Bool.self) {
      self = .bool(v)
    } else if let v = try? c.decode(Double.self) {
      self = .number(v)
    } else if let v = try? c.decode(String.self) {
      self = .string(v)
    } else if let v = try? c.decode([JSONValue].self) {
      self = .array(v)
    } else {
      self = .object(try c.decode([String: JSONValue].self))
    }
  }
  func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .object(let v): try c.encode(v)
    case .array(let v): try c.encode(v)
    case .string(let v): try c.encode(v)
    case .number(let v): try c.encode(v)
    case .bool(let v): try c.encode(v)
    case .null: try c.encodeNil()
    }
  }
  subscript(_ key: String) -> JSONValue {
    if case .object(let v) = self { return v[key] ?? .null }
    return .null
  }
  var string: String {
    switch self {
    case .string(let v): return v
    case .number(let v): return v == v.rounded() ? String(format: "%.0f", v) : String(v)
    case .bool(let v): return v ? "1" : "0"
    default: return ""
    }
  }
  var double: Double? {
    if case .number(let v) = self { return v }
    return Double(string)
  }
  var int: Int { Int(double ?? 0) }
  var flag: Bool {
    if case .bool(let v) = self { return v }
    return int != 0
  }
  var isNull: Bool { self == .null }
  var array: [JSONValue] {
    if case .array(let v) = self { return v }
    return []
  }
  var object: [String: JSONValue] {
    if case .object(let v) = self { return v }
    return [:]
  }
  var id: String {
    self["id"].string.isEmpty
      ? (self["record_key"].string.isEmpty ? string : self["record_key"].string) : self["id"].string
  }
  func text(_ key: String, _ fallback: String = "") -> String {
    let s = self[key].string
    return s.isEmpty ? fallback : s
  }
  static func strings(_ values: [String: String]) -> JSONValue {
    .object(values.mapValues { .string($0) })
  }
}

enum SytimeDate {
  static let timeZone = TimeZone(identifier: "Asia/Shanghai")!
  static var calendar: Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = timeZone
    return c
  }
  static func day(_ date: Date = Date()) -> String {
    let f = DateFormatter()
    f.calendar = calendar
    f.timeZone = timeZone
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
  }
  static func shifted(_ day: String, by days: Int) -> String {
    let f = DateFormatter()
    f.calendar = calendar
    f.timeZone = timeZone
    f.dateFormat = "yyyy-MM-dd"
    guard let date = f.date(from: day),
      let next = calendar.date(byAdding: .day, value: days, to: date)
    else { return day }
    return self.day(next)
  }
  static func display(_ value: JSONValue) -> String {
    let date: Date?
    if let n = value.double {
      date = Date(timeIntervalSince1970: n > 10_000_000_000 ? n / 1000 : n)
    } else {
      let iso = ISO8601DateFormatter()
      date =
        iso.date(from: value.string)
        ?? {
          let f = DateFormatter()
          f.timeZone = timeZone
          f.dateFormat = "yyyy-MM-dd HH:mm:ss"
          return f.date(from: value.string)
        }()
    }
    guard let date else { return value.string }
    let f = DateFormatter()
    f.locale = Locale(identifier: "zh_CN")
    f.timeZone = timeZone
    f.dateFormat = "yyyy年M月d日 HH:mm"
    return f.string(from: date)
  }
}

func money(_ value: JSONValue) -> String {
  guard let price = value.double else { return "价格未注明" }
  return price == 0
    ? "免费" : price.formatted(.currency(code: "CNY").locale(Locale(identifier: "zh_CN")))
}

let roleNames = ["guest": "访客", "user": "普通用户", "student": "学生", "admin": "管理员", "operator": "运营者"]
let kindNames = [
  "wiki_create": "Wiki 新建", "wiki_edit": "Wiki 修改", "nickname": "昵称变更",
  "signature": "签名变更", "display_id": "展示 ID", "avatar": "头像变更", "appeal": "封禁申诉",
  "dish_review": "菜品评价", "shop_review": "店铺评价", "shop": "店铺推荐",
]
let statusNames = [
  "pending": "待审核", "approved": "已通过", "rejected": "未通过", "withdrawn": "已撤回", "resolved": "已回复",
  "active": "正常", "banned": "已封禁",
]
let mealNames = ["morning": "早餐", "noon": "午餐", "evening": "晚餐", "night": "夜宵", "break": "课间加餐"]
let mealOrder = ["morning", "noon", "evening", "night", "break"]
let shopSorts = [
  "campus": "离学校近", "az": "拼音排序", "metro": "离地铁近", "likes": "点赞最多", "reviews": "评价最多",
  "rating": "评分最高", "new": "最新收录",
]

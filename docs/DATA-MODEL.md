# CampusFlow 数据模型

代码位置：`src/core/models/`（TS 类型 + Zod schema 同文件），数据库：`src/core/db/dexie.ts`。

## 1. 全局约定

| 约定 | 说明 |
| --- | --- |
| ID | 所有实体主键 `id`，由 `crypto.randomUUID()` 生成 |
| 日期 | `ISODate` = `"yyyy-MM-dd"`，本地日历日，无时区偏移 |
| 时间 | `HHmmTime` = `"HH:mm"` 24 小时制定宽字符串（可直接字符串比较先后） |
| 时间戳 | `createdAt` / `updatedAt` 为 epoch 毫秒 |
| 星期 | `dayOfWeek` 固定 1=周一 … 7=周日（ISO）；显示顺序由学期 `weekStartsOn` 决定 |
| 教学周 | 1-based；单双周按教学周序号计算，与自然日历周无关 |
| 校验 | 所有写入路径必须通过对应 Zod schema；错误信息为中文 |

## 2. 实体

### Semester（学期）
```ts
{ id, name, startDate /* 开学日 */, weekOneAnchor /* 第一周第一天 */,
  totalWeeks, weekStartsOn: 0|1, status: "current"|"archived",
  createdAt, updatedAt }
```
- `weekOneAnchor` 默认 = 开学日期所在周的第一天（`computeWeekOneAnchor()` 推算，可改）。
- 学期是课程、节次时间、调课记录的容器：**不同学期独立配置**。
- "当前学期" 存于设置 `activeSemesterId`；`status` 仅区分进行中/归档，是否在未来由日期推导。

### Course + CourseSession（课程与上课安排，1:N）
```ts
Course:        { id, semesterId, name, teacher?, building?, room?, type, color, icon?, note?, order }
CourseSession: { id, courseId, semesterId, dayOfWeek: 1-7, startSlot, endSlot, weekRule: WeekRule,
                 teacher?, building?, room?, note? }
```
- 一门课多个安排 = 多条 session（例如周一 1-2 节 1-8 周在 A 楼 + 周三 3-4 节全年在 B 楼）。
- session 可覆盖教师/楼/教室：**配合不同 weekRule 即可实现"不同周次不同教师/跨周不同教室"**。
- `color` 是调色板 ID（第二阶段定义 12 色课程色板），不存具体色值，保证换主题不脏。
- `order` 支持同学期内自定义排序（复合索引 `[semesterId+order]`）。

### WeekRule（周次规则，被 CourseSession 引用）
```ts
{ type: "all" } | { type: "odd" } | { type: "even" }
| { type: "range", from, to }        // 第 1～8 周
| { type: "custom", weeks: number[] } // 任意不连续周，如 [1,3,5,7]
```
解析：`resolveWeeks(rule, totalWeeks)` → 升序去重的周次数组（越界截断）；`weekRuleContains()` 判命中；`weekRuleLabel()` 出中文描述。

### CourseException（调课 / 停课 / 补课）
按 `kind` 判别的联合类型，**不修改原始重复规则**：
- `cancel`：`sessionId + originalDate` 定位某次原课 → 停掉
- `adjust`：同上定位 → `newDate / newStartSlot+newEndSlot（成对）/ newBuilding / newRoom / newTeacher` 至少改一项
- `extra`（补课）：`courseId + date + startSlot + endSlot`（+ 可选教室教师），在重复规则外新增一次
- 记录可编辑、可撤销（直接删除记录即可恢复原状）、可删除；与原始 session 通过 `sessionId/courseId` 关联

### ClassTimeSlot（节次时间，每学期独立）
```ts
{ id, semesterId, index /* 1-based */, name?, startTime, endTime }
```
节数与每节时间完全自定义；提供 `DEFAULT_SLOT_TEMPLATE`（12 节常见作息）作为初始值。

### ScheduleEvent（个人日程 / 活动 / 重要日期 / 待办）
```ts
{ id, semesterId?, title, date, allDay, startTime?, endTime?,
  category: "personal"|"activity"|"important"|"todo", color?, note?, done? }
```
非全天日程必须给 `startTime`。与课表同屏展示时使用独立视觉标识（第六阶段）。

### Exam（考试）
```ts
{ id, semesterId, courseId?, name, date, startTime, endTime, building?, room?, seat?, note? }
```
倒计时由 UI 按当前日期实时计算，不落库。

### ReminderRule（提醒规则）
```ts
{ id, scope: "global"|"course", kind: "class"|"exam"|"event", courseId?, minutesBefore: 1-1440, enabled }
```
`scope=course` 必须带 `courseId`，用于单门课程覆盖全局默认（Zod refine 强制）。预设提前量 5/10/15/30 分钟，支持自定义。

### PreferenceRecord（偏好设置）
```ts
{ key: "app", value: AppSettings, updatedAt }
```
`AppSettings = { themeId, mode, accent, decorations, showWeekend, activeSemesterId? }`。

### BackupMetadata（备份元信息）
```ts
{ id, createdAt, schemaVersion, appVersion, counts: Record<string, number>, note? }
```
JSON 备份 = `{ meta, data: { 每张表的数组 } }`；导入时逐条 Zod 校验，逐表可选、缺失视为空。

## 3. Dexie schema v1

```
semesters:         "id, status, startDate"
courses:           "id, semesterId, [semesterId+order]"
courseSessions:    "id, courseId, semesterId, [semesterId+dayOfWeek]"
courseExceptions:  "id, semesterId, courseId, kind, originalDate, date"
timeSlots:         "id, semesterId, [semesterId+index]"
scheduleEvents:    "id, semesterId, date"
exams:             "id, semesterId, date"
reminderRules:     "id, scope, courseId"
preferences:       "key"
```

未列入索引的属性照常存储。常见查询路径：按学期取全部 session（`semesterId` 索引）、某学期周一的课（复合索引）、某日期的例外（`originalDate`/`date` 索引）。

## 4. 版本与迁移策略

- `DB_SCHEMA_VERSION = 1`；变更 schema 必须新增 `this.version(n).stores(...).upgrade(tx => ...)`，禁止修改旧版本声明。
- 备份携带 `schemaVersion`：将来导入旧备份时按需迁移后再入库。
- 校验失败的存量记录（如手动改坏）读取时跳过并告警，不阻断应用启动。

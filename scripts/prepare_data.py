# -*- coding: utf-8 -*-
"""
تحضير بيانات الديمو لنظام بيانات المدن الصناعية.

يقرأ ملفي حسياء وعدرا من مجلد data/، ويحوّل عينة تمثيلية منهما إلى الهيكل
المقترح (19 جدولاً، أسماء الحقول حرفياً من src/schema/schema.json)، ويكتب:

  src/data/db.json              الجداول بعد الهيكلة (عينة ~150 تخصيصاً لكل مدينة)
  src/data/raw_rows.json        السطور الأصلية كما وردت في الإكسل (لصفحة قبل/بعد)
  src/data/quality_report.json  عدد المشاكل بكل نوع على كامل الملفات + أمثلة حقيقية
  src/data/stats.json           أرقام اللوحة العامة محسوبة على كامل الملفات
  src/data/lists_data.json      قيم القوائم المرجعية المستخرجة من الملفات

التشغيل:  python scripts/prepare_data.py
المتطلبات: openpyxl, msoffcrypto-tool
"""
from __future__ import annotations

import collections
import datetime as dt
import io
import json
import random
import re
import sys
import warnings
from pathlib import Path

import msoffcrypto
import openpyxl
from openpyxl.utils import get_column_letter

warnings.filterwarnings("ignore")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "src" / "data"
SCHEMA = json.loads((ROOT / "src" / "schema" / "schema.json").read_text(encoding="utf-8"))
FIELDS = {t["id"]: [f["name"] for f in t["fields"]] for t in SCHEMA["tables"]}
LISTS = SCHEMA["lists"]

ADRA_PASSWORD = "2009"
SNAPSHOT = {"حسياء": "2026-08-01", "عدرا": "2026-10-05"}  # تاريخ نسخة كل ملف (من اسمه)
TODAY = dt.date.today()
random.seed(2026)

ADRA, HASYA = "عدرا", "حسياء"


# ───────────────────────── قراءة الملفات ─────────────────────────

def find_file(*patterns: str) -> Path:
    for p in patterns:
        hits = sorted(DATA_DIR.glob(p))
        if hits:
            return hits[0]
    raise SystemExit(f"لم أجد الملف في data/: {patterns}")


def load_adra() -> openpyxl.Workbook:
    path = find_file("ارشفة*.xlsx", "*ارشفة*.xlsx")
    office = msoffcrypto.OfficeFile(open(path, "rb"))
    office.load_key(password=ADRA_PASSWORD)
    buf = io.BytesIO()
    office.decrypt(buf)
    buf.seek(0)
    return openpyxl.load_workbook(buf, data_only=True)


def load_hasya() -> openpyxl.Workbook:
    return openpyxl.load_workbook(find_file("Database*.xlsx"), data_only=True)


class Sheet:
    """غلاف بسيط لشيت: السطور بأرقامها في الإكسل + الخلايا المدموجة."""

    def __init__(self, ws, header_row: int = 1):
        self.title = ws.title
        self.rows = {i: row for i, row in enumerate(ws.iter_rows(values_only=True), start=1)}
        self.header_row = header_row
        self.header = list(self.rows.get(header_row, ()))
        self.merged: dict[tuple[int, int], tuple[str, object, bool]] = {}
        self.merged_ranges = [str(m) for m in ws.merged_cells.ranges]
        for mr in ws.merged_cells.ranges:
            top_left = ws.cell(mr.min_row, mr.min_col).value
            for r in range(mr.min_row, mr.max_row + 1):
                for c in range(mr.min_col, mr.max_col + 1):
                    self.merged[(r, c - 1)] = (str(mr), top_left, (r, c) == (mr.min_row, mr.min_col))

    def get(self, r: int, c: int | None, fill_merged: bool = True):
        if c is None:
            return None
        row = self.rows.get(r, ())
        v = row[c] if c < len(row) else None
        if v is None and fill_merged and (r, c) in self.merged:
            v = self.merged[(r, c)][1]
        return v

    def from_merge(self, r: int, c: int) -> bool:
        m = self.merged.get((r, c))
        return bool(m and not m[2])

    def data_rows(self, start: int | None = None):
        start = start or self.header_row + 1
        for r in sorted(self.rows):
            if r >= start and any(v not in (None, "") for v in self.rows[r]):
                yield r


# ───────────────────────── أدوات التنظيف ─────────────────────────

AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
EMPTY = {"", "#N/A", "#######", "ــ", "-", "—", "None", "*", "**", "***"}


def s(v) -> str | None:
    """قيمة نصية منظفة أو None."""
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, (dt.datetime, dt.date)):
        return v.strftime("%Y-%m-%d")
    t = str(v).replace("‏", "").replace("‎", "").replace("\xa0", " ").translate(AR_DIGITS)
    t = re.sub(r"\s+", " ", t).strip()
    return None if t in EMPTY else t


def s0(v) -> str | None:
    """مثل s لكن الصفر يعني فارغ (حسياء تكتب 0 في الخانات الفارغة)."""
    t = s(v)
    return None if t in ("0", "0.0") else t


def num(v):
    """يعيد (رقم أو None، وصف المشكلة أو None)."""
    if v is None or isinstance(v, bool):
        return None, None
    if isinstance(v, (int, float)):
        f = float(v)
        return (int(f) if f.is_integer() else round(f, 4)), None
    t = s(v)
    if t is None:
        return None, None
    t2 = t.replace(",", "")
    if re.fullmatch(r"-?\d+(\.\d+)?", t2):
        return num(float(t2))[0], None
    return None, f"قيمة غير رقمية: «{t}»"


def num0(v):
    n, issue = num(v)
    return (None, issue) if n == 0 else (n, issue)


DATE_RE = re.compile(r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{2,4})")


def to_date(v):
    """يعيد (تاريخ ISO أو None، النوع) والنوع: None | text | double | invalid."""
    if v is None:
        return None, None
    if isinstance(v, dt.datetime):
        return v.date().isoformat(), None
    if isinstance(v, dt.date):
        return v.isoformat(), None
    if isinstance(v, (int, float)):
        return (None, None) if v == 0 else (None, "invalid")
    t = s(v)
    if t is None:
        return None, None
    found = DATE_RE.findall(t) + re.findall(r"(\d{4})-(\d{2})-(\d{2})", t)
    if len(found) >= 2:
        return None, "double"
    m = DATE_RE.search(t)
    if m:
        d, mo, y = map(int, m.groups())
        y = y + 2000 if y < 100 else y
        try:
            date = dt.date(y, mo, d)
        except ValueError:
            return None, "invalid"
        if not 1970 <= y <= TODAY.year + 1:
            return None, "invalid"
        return date.isoformat(), "text"
    return None, "invalid"


def mask_id(v) -> str | None:
    t = s(v)
    if not t:
        return None
    t = re.sub(r"\s", "", t)
    return "●●●●" + t[-4:] if len(t) > 4 else "●●●●"


def norm_key(t: str) -> str:
    t = re.sub(r"[\s‏\-ـ]", "", t or "")
    for a, b in (("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ة", "ه"), ("ى", "ي")):
        t = t.replace(a, b)
    return t


COMMON_TOKENS = {"محمد", "احمد", "بن", "بنت", "شركه", "و", "عبد", "ابناء", "الصناعيه", "للصناعه", "التجاريه"}


def similar(a, b) -> bool:
    """تشابه تقريبي بين اسمين (كلمة مميزة مشتركة على الأقل)."""
    ta = {norm_key(x) for x in re.split(r"[\s()+/\-]+", s(a) or "") if len(x) > 2}
    tb = {norm_key(x) for x in re.split(r"[\s()+/\-]+", s(b) or "") if len(x) > 2}
    return bool((ta & tb) - COMMON_TOKENS)


def display(v):
    """القيمة كما تظهر للمستخدم في الإكسل + نوعها."""
    if isinstance(v, dt.datetime):
        return f"{v.day}/{v.month}/{v.year}", "date"
    if isinstance(v, float):
        return (str(int(v)) if v.is_integer() else str(v)), "num"
    if isinstance(v, int):
        return str(v), "num"
    return str(v), "text"


# ───────────────────────── رقم المقسم ─────────────────────────

def split_plots(raw):
    """يفصل خانة المقسم إلى مقاسم موحدة. يعيد (قائمة، ملاحظات المراجعة، علامات الجودة)."""
    review, tags = [], set()
    if raw is None:
        return [], review, tags
    if isinstance(raw, float):
        if raw.is_integer():
            raw = int(raw)
        else:
            tags.add("float")
            review.append(f"رقم المقسم مخزن كرقم عشري ({raw})")
    t = str(raw).replace("‏", "").translate(AR_DIGITS).strip()
    if not t or t in EMPTY:
        return [], review, tags
    if "+" in t:
        tags.add("merged")
    if "\\" in t:
        tags.add("backslash")
    text_part = re.sub(r"[\d+/\\\-\sLQ\"]", "", t)
    if text_part:
        tags.add("text")
        review.append(f"نص داخل رقم المقسم: «{text_part}»")
        t = re.sub(r"[^\d+/\\\-LQ\s]", " ", t)
    t = t.replace("\\", "/").replace('"', "")
    tokens = [p.strip().replace(" ", "") for p in t.split("+")]
    if any(not p for p in tokens):
        tags.add("dangling")
        review.append("علامة + زائدة في رقم المقسم")
    tokens = [p for p in tokens if p]
    out = []
    for p in tokens:
        if "-" in p:
            tags.add("dash")
            review.append(f"رقم مقسم بفاصل (-) غير مفهوم: «{p}» — لم يُفصل")
        out.append(p)
    # 113/8+9 : الجزء الثاني بدون بلوك
    if len(out) > 1 and "/" in out[0] and any("/" not in p and p.isdigit() for p in out[1:]):
        tags.add("partial")
        review.append(f"«{raw}»: جزء فرعي بدون رقم بلوك (قد يعني {out[0].split('/')[0]}/…) — لم يُخمَّن")
    return out, review, tags


# ───────────────────────── الأسماء والشركاء ─────────────────────────

COMPANY_WORDS = ("شركة", "مؤسسة", "مجموعة", "المساهمة", "المحدودة", "الشركة", "مصنع", "معمل")
PUBLIC_WORDS = ("غرفة", "خزانة", "نقابة", "وزارة", "مديرية", "المؤسسة العامة", "مركز هاتف",
                "بلدية", "المصرف", "الهيئة", "محافظة", "جمعية", "اتحاد", "المدينة الصناعية", "مجلس")
LEGAL_FORMS = (("محدودة المسؤولية", "محدودة المسؤولية"), ("محدودة المسئولية", "محدودة المسؤولية"),
               ("تضامنية", "تضامنية"), ("مساهمة مغفلة", "مساهمة مغفلة"),
               ("المساهمة المغفلة", "مساهمة مغفلة"), ("قيد التأسيس", "قيد التأسيس"))
W_NAMES = {"وليد", "وائل", "وفاء", "وجيه", "وسيم", "وهيب", "وديع", "وعد", "وسام", "وحيد", "وضاح", "ولاء",
           "وهبة", "وفيق", "وصفي", "وداد", "وطفة", "وصال", "ورد", "وردة", "وجدي", "وهاب", "وحيدة",
           "وفيقة", "وصفية", "ونس", "وجيهة", "وئام", "وهبي", "وجد", "وسيلة"}
MARKERS = ("بن", "ابن", "بنت", "أبناء", "ابناء", "بنات")
JOIN_NEXT = ("عبد", "أبو", "ابو", "أبي", "ابي", "أم", "ام", "بو")
JOIN_PREV = ("الدين", "الله", "الين", "الرحمن", "الرحيم")


def split_persons(text: str):
    t = re.sub(r"[()]", " ", text)
    t = re.sub(r"\s*(?:\+|،|,|\s-\s|ـ|/|\n|\d+\s*-)\s*", " | ", t)
    chunks: list[list[str]] = [[]]
    unnamed = False
    for tok in t.split():
        if tok in ("|", "و"):
            chunks.append([])
            continue
        if tok in ("وشركاه", "وشركاؤه", "وشركائه", "وأولاده", "واولاده"):
            unnamed = True
            continue
        if tok.startswith("و") and len(tok) > 2 and tok not in W_NAMES and chunks[-1]:
            chunks.append([tok[1:]])
            continue
        chunks[-1].append(tok)
    out = []
    for c in chunks:
        joined: list[str] = []
        i = 0
        while i < len(c):
            tok = c[i]
            if tok in JOIN_NEXT and i + 1 < len(c) and c[i + 1] not in MARKERS:
                joined.append(f"{tok} {c[i + 1]}")
                i += 2
                continue
            if tok in JOIN_PREV and joined and joined[-1] not in MARKERS:
                joined[-1] = f"{joined[-1]} {tok}"
                i += 1
                continue
            joined.append(tok)
            i += 1
        if joined:
            out.append(joined)
    return out, unnamed


def parse_chunk(toks: list[str]) -> dict:
    p = {"first": None, "father": None, "family": None, "gender": None, "group": False, "review": []}
    for mk in MARKERS:
        if mk in toks:
            i = toks.index(mk)
            left = toks[:i]
            p["father"] = " ".join(toks[i + 1:]) or None
            p["gender"] = "أنثى" if mk in ("بنت", "بنات") else "ذكر"
            p["group"] = mk in ("أبناء", "ابناء", "بنات")
            if left:
                p["first"] = left[0]
                p["family"] = " ".join(left[1:]) or None
            return p
    if len(toks) == 1:
        p["first"] = toks[0]
    elif len(toks) == 2:
        p["first"], p["family"] = toks
    else:
        p["first"], p["family"] = toks[0], toks[-1]
        p["father"] = " ".join(toks[1:-1])
        p["review"].append("ترتيب الاسم / اسم الأب غير مؤكد")
    return p


def parse_persons(text: str | None) -> tuple[list[dict], list[str]]:
    if not text:
        return [], []
    chunks, unnamed = split_persons(text)
    people = [parse_chunk(c) for c in chunks]
    notes = ["توجد عبارة (وشركاه) — شركاء غير مسمّين"] if unnamed else []
    for i, p in enumerate(people):
        if p["first"] and not p["family"]:
            nxt = next((q for q in people[i + 1:] if q["family"]), None)
            if nxt:
                p["family"] = nxt["family"]
                if not p["father"] and nxt["group"]:
                    p["father"] = nxt["father"]
                    p["gender"] = p["gender"] or nxt["gender"]
                p["review"].append("الكنية مستنتجة من الشريك التالي")
            else:
                p["review"].append("الكنية غير موجودة في الاسم")
    return [p for p in people if p["first"]], notes


def parse_investor(raw: str, partners_raw: str | None = None) -> dict:
    t = s(raw) or ""
    out = {"name": t, "type": None, "legal_form": None, "cr_no": None, "cr_year": None,
           "persons_text": None, "review": []}
    work = t
    m = re.search(r"سجل\s*(?:ال)?تجاري\s*(?:رقم)?\s*[/:\s]*(\d+)\s*/?\s*(?:تاريخ\s*([\d/]+))?\s*/?", work)
    if m:
        out["cr_no"] = m.group(1)
        out["cr_year"] = m.group(2)
        work = (work[: m.start()] + " " + work[m.end():]).strip()
    for k, v in LEGAL_FORMS:
        if k in t:
            out["legal_form"] = v
            break
    persons = None
    m2 = re.search(r"(?:لاصحابها|لأصحابها|لصاحبها|لصاحبتها|أصحابها|اصحابها)\s*[:(]?\s*(.+)$", work)
    if m2:
        persons = m2.group(1)
        work = work[: m2.start()]
    # الأقواس: إما شكل قانوني فقط أو أسماء شركاء
    pm = re.search(r"\(([^()]*)\)?", work)
    if pm:
        content = pm.group(1).strip()
        bare = re.sub(r"شركة|محدودة|المحدودة|المسؤولية|المسئولية|تضامنية|مساهمة|مغفلة|قيد|التأسيس|\s", "", content)
        tail = work[pm.end():].strip()
        if not bare:
            work = work[: pm.start()] + " "
            if tail and persons is None:
                persons = tail
            elif tail:
                work += tail
        elif persons is None:
            persons = content
            work = work[: pm.start()] + (" " + tail if tail else "")
    work = re.sub(r"[\s\-/(]+$", "", re.sub(r"\s+", " ", work)).strip()
    is_company = any(w in t for w in COMPANY_WORDS) or out["legal_form"] is not None
    is_public = any(w in t for w in PUBLIC_WORDS) and not re.search(r"\bبن\b|بنت|أبناء", t)
    if is_public and not t.startswith("شركة"):
        out["type"] = "جهة عامة"
    elif is_company:
        out["type"] = "شركة"
    else:
        out["type"] = "شخص طبيعي"
    out["name"] = work or t
    if out["type"] == "شركة":
        out["persons_text"] = partners_raw or persons
        if not out["persons_text"]:
            out["review"].append("أسماء الشركاء غير مذكورة")
    elif out["type"] == "شخص طبيعي":
        out["persons_text"] = partners_raw or out["name"]
    if out["type"] == "شخص طبيعي" and not out["legal_form"]:
        n = len(split_persons(out["persons_text"] or "")[0])
        out["legal_form"] = "فردي" if n == 1 else None
    return out


# ───────────────────────── تطبيع القيم ─────────────────────────

class Normalizer:
    """يسجل كل قيمة غير موحدة (نسخ مختلفة لنفس المعنى) لتقرير الجودة."""

    def __init__(self):
        self.city = None
        self.variants: dict[tuple, dict[str, collections.Counter]] = collections.defaultdict(
            lambda: collections.defaultdict(collections.Counter))

    def note(self, field: str, raw, value):
        if raw is None or value is None or self.city is None:
            return
        self.variants[(self.city, field)][value][str(raw)] += 1


NORM = Normalizer()


def norm_legal(raw):
    t = s(raw)
    if not t:
        return None
    k = t.replace(" ", "").replace("/", "")
    m = re.search(r"(\d+)", k)
    val = t
    if "قانون" in k and m:
        val = f"قانون {m.group(1)}"
    elif "مرسوم" in k and m:
        val = f"مرسوم {m.group(1)}"
    if val == "قانون 47":
        val = "القانون 47"
    NORM.note("السند القانوني", raw, val)
    return val


def norm_phase(raw):
    t = s(raw)
    if not t:
        return None
    val = t.replace("الاولى", "الأولى").replace("أولى جغرافياً", "أولى جغرافيا")
    NORM.note("المرحلة الجغرافية", raw, val)
    return val


def norm_sector(raw):
    t = s(raw)
    if not t:
        return None
    val = t.replace("قطاع أول", "قطاع اول")
    NORM.note("المنطقة / القطاع", raw, val)
    return val


def norm_issuer(raw):
    t = s(raw)
    if not t:
        return None
    if "وزارة الصناعة" in t:
        val = "الوزارة"
    elif "دائرة التراخيص" in t:
        val = "دائرة التراخيص"
    elif "مجلس المدينة" in t:
        val = "مجلس المدينة"
    elif "محافظ" in t:
        val = "المحافظ"
    else:
        val = t
    NORM.note("الجهة المصدرة", raw, val)
    return val


CATEGORY_LIST = set(LISTS["industry_category"]["values"])


def norm_category(raw):
    """يعيد (الفئة، الدرجة، فئة المشيدات، ملاحظة)."""
    t = s(raw)
    if not t or re.fullmatch(r"\d{4}", t):
        return None, None, None, None
    grade = facility = None
    m = re.match(r"^(.*?)\s*\((\d)\)\s*$", t)
    cat = m.group(1).strip() if m else t
    if m:
        grade = f"({m.group(2)})"
    fm = re.search(r"فئة\s*\(?\s*([بد])\s*\)?", cat)
    if fm:
        facility = f"فئة ({fm.group(1)})"
    if cat.startswith("مواد بناء"):
        cat = "مواد بناء"
    elif cat in ("الدباغات", "دباغة"):
        cat = "دباغات"
    note = None if cat in CATEGORY_LIST else f"فئة صناعية خارج القائمة المرجعية: «{cat}»"
    NORM.note("الفئة الصناعية", raw, cat)
    return cat, grade, facility, note


PLOT_CLASS_MAP = {
    "صناعي": "صناعي",
    "المعدة للاستعمالات الخاصة كلياً أو جزئياً": "استعمالات خاصة",
    "استعمالات خاصة كلياً أو جزئياً": "استعمالات خاصة",
    "المشيدات العامة الخدمية": "مشيدات عامة",
    "مشيدات عامة خدمية": "مشيدات عامة",
    "الخدمية ذات الطابع التجاري": "خدمي تجاري",
    "خدمية ذات طابع تجاري": "خدمي تجاري",
}


def norm_plot_class(raw):
    t = s(raw)
    if not t:
        return None
    val = PLOT_CLASS_MAP.get(t, t)
    NORM.note("تصنيف المقسم", raw, val)
    return val


def parse_decision(raw):
    """'11026/ن' ← (11026، ن). يعيد (رقم، رمز، جهة، مراجعة)."""
    t = s(raw)
    if not t:
        return None, None, None, None
    t2 = t.replace(" ", "")
    issuer = "المحافظ" if "محافظ" in t else None
    m = re.fullmatch(r"(\d+)/?([^\d/]+(?:/[^\d/]+)*)?", t2)
    if m:
        code = m.group(2)
        if code and "قرار" in code:
            code = None
        rev = f"رمز جهة مركّب: «{code}»" if code and "/" in code else None
        return m.group(1), code, issuer, rev
    m = re.fullmatch(r"([^\d/]+)/(\d+)", t2)
    if m:
        return m.group(2), m.group(1), issuer, None
    m = re.match(r"(\d+)", t2)
    if m:
        return m.group(1), None, issuer, f"صيغة قرار غير موحدة: «{t}»"
    return t, None, issuer, f"صيغة قرار غير موحدة: «{t}»"


def internal_ref(raw):
    """'قرار56' ← 'قرار 56'."""
    t = s(raw)
    if not t:
        return None
    m = re.fullmatch(r"قرا?ر?\s*(\d+(?:\s*\+\s*\d+)*)", t)
    return f"قرار {m.group(1).replace(' ', '')}" if m else t


def split_refs(raw):
    """خانة الحيثية: 'قرار3+قرار42' ← ['قرار 3', 'قرار 42']؛ والنص الحر يعود كملاحظة."""
    t = s(raw)
    if not t:
        return [], None
    parts = [p.strip() for p in re.split(r"\+", t) if p.strip()]
    refs, text = [], []
    for p in parts:
        m = re.fullmatch(r"(?:قرار|قرا|ق)?\s*(\d+)", p)
        (refs if m else text).append(f"قرار {m.group(1)}" if m else p)
    return refs, (" + ".join(text) if text else None)


# ───────────────────────── السجلات ─────────────────────────

DB: dict[str, list[dict]] = {t["id"]: [] for t in SCHEMA["tables"]}
RAW: dict[str, list[dict]] = {}
INVESTORS: dict[str, dict] = {}
DECISIONS: dict[tuple, dict] = {}
PLOTS: dict[str, dict] = {}
_seq = collections.Counter()


def rec(table: str, values: dict, alloc: str | None = None, review=None, src=None, **extra) -> dict:
    unknown = [k for k in values if k not in FIELDS[table]]
    assert not unknown, f"حقول غير موجودة في الهيكل ({table}): {unknown}"
    _seq[table] += 1
    r = {"_id": f"{table}-{_seq[table]}"}
    if alloc:
        r["_alloc"] = alloc
    r.update({f: values.get(f) for f in FIELDS[table]})
    r["_review"] = [x for x in (review or []) if x]
    if src:
        r["_src"] = src
    r.update(extra)
    DB[table].append(r)
    return r


def raw_row(sh: Sheet, r: int, label: str, mask_cols=(), header_row=None) -> dict:
    header = list(sh.rows.get(header_row or sh.header_row, ()))
    row = sh.rows.get(r, ())
    width = max(len(row), len(header))
    cells = []
    for c in range(width):
        v = row[c] if c < len(row) else None
        m = sh.merged.get((r, c))
        h = header[c] if c < len(header) else None
        if v is None and not m:
            continue
        disp, kind = display(v) if v is not None else ("", "empty")
        if c in mask_cols and v not in (None, "", 0):
            disp = mask_id(v) or ""
        cells.append({"col": get_column_letter(c + 1), "h": s(h) if h is not None else None, "v": disp,
                      "t": kind, "merged": m[0] if m else None, "fromMerge": bool(m and not m[2])})
    return {"sheet": sh.title, "row": r, "label": label, "cells": cells}


def add_raw(alloc_id: str, raw: dict):
    RAW.setdefault(alloc_id, []).append(raw)


def get_investor(city: str, raw_name, partners_raw=None, nationality=None, docs=None, women=None,
                 contact: dict | None = None) -> str | None:
    name = s(raw_name)
    if not name:
        return None
    info = parse_investor(name, s(partners_raw))
    key = norm_key(info["name"])
    if key in INVESTORS:
        inv = INVESTORS[key]
        if city not in inv["_cities"]:
            inv["_cities"].append(city)
        return inv["رمز المستثمر"]
    code = f"INV-{len(INVESTORS) + 1:05d}"
    contact = contact or {}
    inv = rec("investors", {
        "رمز المستثمر": code,
        "نوع المستثمر": info["type"],
        "الاسم الكامل / اسم المنشأة": info["name"],
        "الشكل القانوني": info["legal_form"],
        "رقم السجل التجاري": info["cr_no"],
        "سنة / مكان السجل": info["cr_year"],
        **contact.get("fields", {}),
    }, review=info["review"] + contact.get("review", []), _cities=[city], _rawName=name)
    INVESTORS[key] = inv

    people, notes = parse_persons(info["persons_text"])
    if notes:
        inv["_review"] += notes
    nats = [x.strip() for x in str(nationality).split("\n") if x.strip()] if nationality else []
    doc_tokens = [x for x in re.split(r"[/\-\s\n]+", str(docs)) if len(x) >= 5] if s(docs) else []
    for i, p in enumerate(people):
        rv = list(p["review"])
        nat = None
        if len(nats) == len(people):
            nat = nats[i]
        elif nats:
            nat = nats[0]
            if len(nats) > 1:
                rv.append("أكثر من جنسية في خلية واحدة — تعذّر الربط بالشركاء")
        if nat in ("ع س", "ع.س", "عربي سوري", "سوري"):
            nat = "سوريا"
        elif nat and nat not in NATIONALITIES_SEEN and nat in ("حمص", "دمشق", "حلب", "حماة", "طرطوس"):
            rv.append(f"عمود الجنسية يحتوي اسم مدينة: «{nat}»")
            nat = None
        doc = None
        if doc_tokens:
            if len(doc_tokens) == len(people):
                doc = doc_tokens[i]
            elif i == 0:
                rv.append("تعذّر ربط أرقام الوثائق بالشركاء")
        doc_type = None
        if doc:
            doc_type = "جواز سفر" if re.search(r"[A-Za-z]", doc) else ("هوية" if re.fullmatch(r"\d{11}", doc) else None)
        gender = p["gender"]
        if women and p["first"] and p["first"] in str(women):
            gender = "أنثى"
        rec("partners", {
            "رمز المستثمر": code, "الاسم": p["first"], "اسم الأب": p["father"], "الكنية": p["family"],
            "الجنس": gender, "الجنسية": nat, "نوع الوثيقة": doc_type, "رقم الوثيقة": mask_id(doc),
            "الصفة": None, "نسبة الملكية %": None,
        }, review=rv)
    return code


NATIONALITIES_SEEN: set[str] = set()


def add_decision(city, raw, date, dtype, internal=None, legal=None, issuer=None) -> str | None:
    number, code, iss, rv = parse_decision(raw)
    if not number:
        return None
    key = (city, number, code, date)
    if key not in DECISIONS:
        DECISIONS[key] = rec("decisions", {
            "المدينة": city, "الرقم الرسمي": number, "رمز الجهة": code,
            "الجهة المصدرة": issuer or iss, "نوع القرار": dtype,
            "الرقم التسلسلي الداخلي": internal_ref(internal), "تاريخ القرار": date,
            "السند القانوني": legal, "ملاحظات": None,
        }, review=[rv])
    return DECISIONS[key]["_id"]


def add_plot(city: str, plot: str, raw_value, **fields) -> str:
    pid = f"{city}|{plot}"
    if pid not in PLOTS:
        PLOTS[pid] = rec("plots", {"المدينة": city, "رقم المقسم الموحد": plot,
                                    "رقم المقسم كما ورد": s(raw_value), **fields})
        PLOTS[pid]["_id"] = pid
    else:
        p = PLOTS[pid]
        for k, v in fields.items():
            if p.get(k) is None and v is not None:
                p[k] = v
    return pid


def link_plots(city, alloc_id, file_no, raw_plot, area, sector=None, phase=None, plot_class=None,
               facility=None, extra_lookup=None) -> list[str]:
    plots, rv, tags = split_plots(raw_plot)
    out = []
    for p in plots:
        fields = {"المنطقة / القطاع": sector, "المرحلة الجغرافية": phase, "تصنيف المقسم": plot_class,
                  "فئة المشيدات": facility}
        if len(plots) == 1:
            fields["المساحة م2"] = area
        if extra_lookup:
            fields.update({k: v for k, v in extra_lookup(p).items() if v is not None})
        pid = add_plot(city, p, raw_plot, **fields)
        rec("allocation_plots", {
            "المدينة": city, "رقم الإضبارة": file_no, "رقم المقسم الموحد": p,
            "المساحة المخصصة من المقسم م2": area if len(plots) == 1 else None,
        }, alloc=alloc_id, _plot=pid)
        out.append(p)
    return out, rv, tags


def add_refs(alloc_id, key, raw, record_type="تخصيص", relation="يستند إلى"):
    refs, text = split_refs(raw)
    for ref in refs:
        rec("decision_refs", {"نوع السجل": record_type, "مفتاح السجل": key,
                              "القرار المرجعي": ref, "نوع العلاقة": relation}, alloc=alloc_id)
    return text


# ═════════════════════════ عدرا ═════════════════════════

class Adra:
    def __init__(self, wb):
        self.fz = Sheet(wb["فرز"])
        self.black = Sheet(wb["بلاك"])
        self.sold = Sheet(wb["مقاسم مباعة"], header_row=2)
        self.fold = Sheet(wb["طلبات طي قرار الغاء"])
        self.merge = Sheet(wb["دمج مقاسم2026"], header_row=2)
        self.misc = Sheet(wb["متفرقات هام"], header_row=2)
        self.law18 = Sheet(wb["قانون 18 لغاية31-05-2026"], header_row=5)
        self.subs = Sheet(wb["ورقة4"])
        self.cancel_subs = Sheet(wb["إلغاء اكتتاب"], header_row=3)
        self.file_counts = collections.Counter(s(self.fz.get(r, 2)) for r in self.fz_rows())
        # الشيت فيه قسمان بعنوانين داخل العمود B: «البيع» ثم «انتقال» (انتقال بالإرث — ليس بيعاً)
        self.sold_section: dict[int, str] = {}
        section = "البيع"
        for r in self.sold.data_rows(3):
            label = self.sold.get(r, 1, fill_merged=False)
            if isinstance(label, str) and s(label) in ("البيع", "انتقال"):
                section = s(label)
                continue
            if s(self.sold.get(r, 2, fill_merged=False)):
                self.sold_section[r] = section
        self.sold_by_plot = collections.defaultdict(list)
        for r in self.sold_section:
            for p in split_plots(self.sold.get(r, 2))[0]:
                self.sold_by_plot[p].append(r)
        self.misc_by_plot = collections.defaultdict(list)
        for r in self.misc.data_rows(3):
            for p in split_plots(self.misc.get(r, 9))[0]:
                if p != "0":
                    self.misc_by_plot[p].append(r)
        self.law_by_plot = collections.defaultdict(list)
        for r in self.law18.data_rows(8):
            for p in split_plots(self.law18.get(r, 4))[0]:
                self.law_by_plot[p].append(r)
        self.subs_by_plot = collections.defaultdict(list)
        for r in self.subs.data_rows(2):
            for p in split_plots(self.subs.get(r, 0))[0]:
                self.subs_by_plot[p].append(r)

    def is_alloc_row(self, r) -> bool:
        v4 = self.fz.get(r, 4)
        if self.fz.get(r, 3) is None or self.fz.get(r, 5) is None:
            return False
        return not (isinstance(v4, int) or s(v4) in ("الصناعة",) or s(self.fz.get(r, 10)) == "تاريخ التخصيص")

    def fz_rows(self):
        return [r for r in self.fz.data_rows() if self.is_alloc_row(r)]

    # ── تخصيص من شيت فرز ──
    def build_fz(self, r: int):
        g = lambda c: self.fz.get(r, c)
        aid = f"ADR-فرز-r{r}"
        review = []
        merged_cols = [get_column_letter(c + 1) for c in range(20) if self.fz.from_merge(r, c)]
        if merged_cols:
            review.append(f"قيم مأخوذة من خلية مدموجة (الأعمدة {', '.join(merged_cols)})")
        file_no = s(g(2))
        info = [f"رقم الإضبارة {file_no} يتكرر {self.file_counts[file_no]} مرة في شيت فرز — المفتاح الداخلي {aid}"]             if file_no and self.file_counts[file_no] > 1 else []
        cat, grade, facility, cat_note = norm_category(g(4))
        date, dkind = to_date(g(10))
        if dkind == "double":
            review.append(f"خلية التاريخ تحتوي تاريخين: «{s(g(10))}» — لم يُخمَّن")
        elif dkind == "invalid":
            review.append(f"تاريخ غير صالح: «{s(g(10))}»")
        area, area_issue = num(g(6))
        inv = get_investor(ADRA, g(5))
        dec_id = add_decision(ADRA, g(9), date, "تخصيص", internal=g(8))
        settled = s(g(18))
        notes = [x for x in (s(g(0)), s(g(16)), s(g(17))) if x and x not in ("1", "2", "3", "4")]
        audit = s(g(19))
        alloc = rec("allocations", {
            "المدينة": ADRA, "رقم الإضبارة": file_no, "الرقم التسلسلي": s(g(1)), "رمز المستثمر": inv,
            "الفئة الصناعية": cat, "درجة الصناعة": grade, "نوع الصناعة": None, "وصف النشاط": None,
            "المساحة الإجمالية م2": area, "قرار التخصيص": s(g(9)), "تاريخ التخصيص": date,
            "السند القانوني": "قانون 18" if s(g(0)) == "قانون 18" else None,
            "الحالة الحالية": "فعّال", "الوضع التشغيلي": None,
            "تمت التسوية": True if settled and "تمت التسوية" in settled else None,
            "حالة التدقيق": audit, "ملاحظات": " · ".join(notes) or None,
        }, review=review + [cat_note, area_issue], src={"sheet": "فرز", "row": r}, _decision=dec_id,
            _dateKind=dkind, _info=info)
        alloc["_id"] = aid
        DB["allocations"][-1]["_id"] = aid
        if settled and "تمت التسوية" not in settled:
            alloc["_review"].append(f"عمود (تمت التسوية) يحتوي قيمة أخرى: «{settled}»")
        plots, prv, tags = link_plots(ADRA, aid, file_no, g(3), area, sector=norm_sector(g(14)),
                                      phase=norm_phase(g(13)), facility=facility,
                                      plot_class="مستودعات" if cat == "مستودعات" else
                                      ("مشيدات عامة" if facility else "صناعي"))
        alloc["_review"] += prv
        alloc["_plotTags"] = sorted(tags)
        count, _ = num(g(12))
        if count and plots and count != len(plots):
            alloc["_review"].append(f"عمود (عدد المقاسم)={count} لا يطابق عدد المقاسم الفعلي ({len(plots)})")
        free_text = add_refs(aid, file_no, g(7))
        if free_text:
            alloc["ملاحظات"] = " · ".join(x for x in (alloc["ملاحظات"], f"حيثية: {free_text}") if x)
        add_raw(aid, raw_row(self.fz, r, "شيت فرز (السجل الأساسي)"))
        self.attach_sales(aid, file_no, plots, g(5))
        self.attach_misc(aid, file_no, plots, g(5))
        self.attach_law18(aid, file_no, plots)
        self.attach_subs(aid, file_no, plots, inv)
        return alloc

    def attach_sales(self, aid, file_no, plots, name):
        seen = set()
        for p in plots:
            for r in self.sold_by_plot.get(p, []):
                # أرقام المقاسم في عدرا تتكرر بين القطاعات: نربط البيع فقط إذا تطابق اسم الشاري أو البائع
                if r in seen or not (similar(self.sold.get(r, 8), name) or similar(self.sold.get(r, 7), name)):
                    continue
                seen.add(r)
                g = lambda c: self.sold.get(r, c)
                date, dkind = to_date(g(10))
                share = s(g(11))
                pct = 100 if share == "الكامل" else None
                rv = [] if share == "الكامل" else [f"النسبة المباعة غير محددة: «{share or 'فارغ'}»"]
                if self.sold_section[r] == "انتقال":
                    # انتقال بالإرث: حدث نقل ملكية بلا عقد بيع
                    rec("events", {
                        "المدينة": ADRA, "رقم الإضبارة": file_no, "رقم المقسم": p,
                        "نوع الحدث": "نقل ملكية كامل" if pct == 100 else "نقل ملكية جزئي",
                        "رقم القرار / الوثيقة": s(g(9)), "تاريخ الحدث": date,
                        "المستثمر السابق": s(g(7)), "المستثمر الجديد": s(g(8)), "النسبة المنقولة %": pct,
                        "التفاصيل": "انتقال ملكية (إرث) — من قسم «انتقال» في شيت المقاسم المباعة، ليس بيعاً",
                    }, alloc=aid, review=rv)
                    add_raw(aid, raw_row(self.sold, r, "شيت مقاسم مباعة — قسم انتقال", header_row=2))
                    continue
                rec("contracts", {
                    "المدينة": ADRA, "رقم الإضبارة": file_no, "نوع العقد": "بيع بين مستثمرين",
                    "رقم العقد": s(g(9)), "تاريخ العقد": date, "القيمة": None, "العملة": None,
                    "البائع": s(g(7)), "الشاري": s(g(8)), "النسبة المباعة %": pct,
                    "الرسوم": s(g(12)), "تاريخ استلام العقد": None,
                }, alloc=aid, review=rv)
                rec("events", {
                    "المدينة": ADRA, "رقم الإضبارة": file_no, "رقم المقسم": p,
                    "نوع الحدث": "نقل ملكية كامل" if pct == 100 else "نقل ملكية جزئي",
                    "رقم القرار / الوثيقة": f"عقد بيع {s(g(9))}" if s(g(9)) else None,
                    "تاريخ الحدث": date, "المستثمر السابق": s(g(7)), "المستثمر الجديد": s(g(8)),
                    "النسبة المنقولة %": pct, "يُحتسب في الإحصاء": None,
                    "التفاصيل": f"من شيت المقاسم المباعة — {s(g(3)) or ''}".strip(" —"),
                }, alloc=aid, review=rv if pct is None else [])
                add_raw(aid, raw_row(self.sold, r, "شيت مقاسم مباعة", header_row=2))

    def attach_misc(self, aid, file_no, plots, name):
        rows = sorted({r for p in plots for r in self.misc_by_plot.get(p, [])})
        for r in rows:
            g = lambda c: self.misc.get(r, c)
            if not similar(g(2), name):
                continue
            date, dk = to_date(g(4))
            dec_date, _ = to_date(g(6))
            kind = s(g(16)) or ""
            duration = "مؤقت" if "مؤقت" in kind else ("دائم" if "دائم" in kind else None)
            rv = [] if duration else [f"مدة الترخيص غير واضحة: «{kind}»"]
            if dk == "text":
                rv.append("تاريخ الترخيص مكتوب كنص")
            rec("admin_licenses", {
                "المدينة": ADRA, "رقم الإضبارة": file_no, "رقم الرخصة الإدارية": s(g(3)),
                "رقم القرار": s(g(5)), "تاريخ الترخيص": date, "المدة": duration, "تاريخ الانتهاء": None,
                "النطاق": None, "صاحب الترخيص": "المستثمر", "رمز المستأجر": None,
                "تفصيل الصناعة": s(g(12)), "الفئة": s0(g(13)),
            }, alloc=aid, review=rv + ([f"المدة: «{kind}»"] if "لمدة" in kind else []))
            if s0(g(5)):
                add_decision(ADRA, g(5), dec_date, "ترخيص")
            if s0(g(7)):
                bdate, _ = to_date(g(8))
                rec("building_licenses", {
                    "المدينة": ADRA, "رقم الإضبارة": file_no, "رقم رخصة البناء": s(g(7)),
                    "تاريخ الرخصة": bdate, "نوع": None, "المساحة المرخصة م2": None, "حالة الترخيص": "مرخص",
                }, alloc=aid)
            hp, _ = num0(g(14))
            area, _ = num0(g(15))
            workers, _ = num0(g(18))
            if hp or area or workers:
                rec("project", {"المدينة": ADRA, "رقم الإضبارة": file_no, "تاريخ التحديث": SNAPSHOT[ADRA],
                                "مجموع القوى المحركة": hp, "مساحة المنشأة المبنية م2": area,
                                "عدد العمال الفعلي": workers}, alloc=aid)
            add_raw(aid, raw_row(self.misc, r, "شيت متفرقات هام (التراخيص الإدارية)", header_row=2))

    def attach_law18(self, aid, file_no, plots):
        rows = sorted({r for p in plots for r in self.law_by_plot.get(p, [])})
        for r in rows:
            g = lambda c: self.law18.get(r, c)
            date, _ = to_date(g(2))
            rec("investment_licenses", {
                "المدينة": ADRA, "رقم الإضبارة": file_no, "رقم إجازة الاستثمار": s(g(1)),
                "تاريخ الإجازة": date, "القانون": "قانون 18", "اسم المشروع": s(g(3)),
                "مستفيد من القانون": True,
            }, alloc=aid)
            value, _ = num0(g(7))
            jobs, jobs_issue = num0(g(14))
            ratio, ratio_issue = num(g(15))
            rec("project", {"المدينة": ADRA, "رقم الإضبارة": file_no, "تاريخ التحديث": SNAPSHOT[ADRA],
                            "القيمة التقديرية للمشروع": value, "فرص العمل المتوقعة": jobs,
                            "نسبة تنفيذ البناء %": round(ratio * 100, 1) if ratio is not None and ratio <= 1 else ratio},
                alloc=aid, review=[jobs_issue, ratio_issue])
            if s0(g(10)):
                bdate, _ = to_date(g(11))
                rec("building_licenses", {"المدينة": ADRA, "رقم الإضبارة": file_no,
                                          "رقم رخصة البناء": s(g(10)), "تاريخ الرخصة": bdate,
                                          "حالة الترخيص": "مرخص"}, alloc=aid)
            if s0(g(12)):
                adate, _ = to_date(g(13))
                rec("admin_licenses", {"المدينة": ADRA, "رقم الإضبارة": file_no, "رقم الرخصة الإدارية": None,
                                       "رقم القرار": s(g(12)), "تاريخ الترخيص": adate, "المدة": None,
                                       "صاحب الترخيص": "المستثمر"}, alloc=aid,
                    review=["رقم الرخصة الإدارية غير مذكور في شيت قانون 18 (رقم القرار فقط)"])
            add_raw(aid, raw_row(self.law18, r, "شيت قانون 18", header_row=5))

    def attach_subs(self, aid, file_no, plots, inv):
        rows = sorted({r for p in plots for r in self.subs_by_plot.get(p, [])})
        for r in rows[:1]:
            g = lambda c: self.subs.get(r, c)
            date, dk = to_date(g(5))
            cat, _, _, _ = norm_category(g(1))
            area, _ = num(g(3))
            rec("subscriptions", {
                "المدينة": ADRA, "رقم الطلب": None, "رمز المستثمر": inv, "تاريخ الاكتتاب": date,
                "الإطار القانوني": None, "الصناعة المطلوبة": cat, "المساحة المطلوبة م2": area,
                "حالة الطلب": "تحوّل إلى تخصيص", "رقم قرار الإلغاء / الانسحاب": None, "تاريخ الإلغاء": None,
                "ملاحظات": None,
            }, alloc=aid, review=["مصدر تاريخ الاكتتاب: الشيت المسودة (ورقة4) — يحتاج تأكيد"])
            add_raw(aid, raw_row(self.subs, r, "شيت ورقة4 (مسودة — تاريخ الاكتتاب)"))

    # ── تخصيص ملغى من شيت بلاك ──
    def build_black(self, r: int):
        g = lambda c: self.black.get(r, c)
        aid = f"ADR-بلاك-r{r}"
        review = ["رقم الإضبارة مأخوذ من عمود بدون عنوان (P) في شيت بلاك"]
        file_no = s(g(15))
        cat, grade, facility, cat_note = norm_category(g(3))
        date, dkind = to_date(g(7))
        cdate, ckind = to_date(g(10))
        area, area_issue = num(g(4))
        inv = get_investor(ADRA, g(1))
        dec_id = add_decision(ADRA, g(6), date, "تخصيص", internal=g(5) if s(g(5)) and "قرار" in s(g(5)) else None)
        reason = " ".join(x for x in (s(g(11)), s(g(12)), s(g(13))) if x and x not in ("1", "د"))
        swap = "تبديل مقسم" in reason
        merged = s(g(0)) == "دمج مقاسم"
        status = "مدموج" if merged else "ملغى"
        alloc = rec("allocations", {
            "المدينة": ADRA, "رقم الإضبارة": file_no, "الرقم التسلسلي": s(g(0)) if s(g(0)) != "دمج مقاسم" else None,
            "رمز المستثمر": inv, "الفئة الصناعية": cat, "درجة الصناعة": grade, "وصف النشاط": None,
            "المساحة الإجمالية م2": area, "قرار التخصيص": s(g(6)), "تاريخ التخصيص": date,
            "الحالة الحالية": status, "ملاحظات": s(g(5)) if s(g(5)) and "قرار" not in s(g(5)) else None,
        }, review=review + [cat_note, area_issue] +
            ([f"تاريخ التخصيص: «{s(g(7))}» — {dkind}"] if dkind in ("double", "invalid") else []),
            src={"sheet": "بلاك", "row": r}, _decision=dec_id, _dateKind=dkind)
        alloc["_id"] = aid
        if any(self.black.from_merge(r, c) or self.black.merged.get((r, c)) for c in range(11, 14)):
            alloc["_review"].append("سبب الإلغاء في خلية مدموجة (L:N)")
        plots, prv, tags = link_plots(ADRA, aid, file_no, g(2), area, plot_class="صناعي", facility=facility)
        alloc["_review"] += prv
        alloc["_plotTags"] = sorted(tags)
        cancel_dec = add_decision(ADRA, g(9), cdate, "إلغاء", internal=g(8))
        etype = "تبديل مقسم" if swap else ("دمج" if merged else "إلغاء تخصيص")
        rec("events", {
            "المدينة": ADRA, "رقم الإضبارة": file_no, "رقم المقسم": plots[0] if len(plots) == 1 else None,
            "نوع الحدث": etype, "رقم القرار / الوثيقة": s(g(9)), "تاريخ الحدث": cdate,
            "يُحتسب في الإحصاء": False if "لايحسب" in reason else None, "التفاصيل": reason or None,
        }, alloc=aid, review=[f"تاريخ الإلغاء: «{s(g(10))}»" if ckind in ("double", "invalid") else None],
            _decision=cancel_dec)
        add_raw(aid, raw_row(self.black, r, "شيت بلاك (الملغاة)"))
        return alloc

    # ── طلبات طي قرار الإلغاء ──
    def build_fold(self, r: int):
        g = lambda c: self.fold.get(r, c)
        shifted = isinstance(g(1), int) and isinstance(g(3), str)
        aid = f"ADR-طلبات-r{r}"
        if shifted:   # الأعمدة مزاحة: المقسم في عمود الاسم...
            name, plot, ind, area_raw = g(3), g(1), g(2), g(4)
            dec_raw, date_raw = g(8), g(9)
            cancel_raw, cdate_raw = None, None
        else:
            name, plot, ind, area_raw = g(1), g(2), g(3), g(4)
            dec_raw, date_raw = g(6), g(7)
            cancel_raw, cdate_raw = g(9), g(10)
        note = s(g(5)) or ""
        review = ["أعمدة هذا السطر مزاحة عن العناوين — أُعيد ترتيبها"] if shifted else []
        cat, grade, _, cat_note = norm_category(ind)
        date, _ = to_date(date_raw)
        area, _ = num(area_raw)
        inv = get_investor(ADRA, name)
        alloc = rec("allocations", {
            "المدينة": ADRA, "رقم الإضبارة": None, "الرقم التسلسلي": s(g(0)), "رمز المستثمر": inv,
            "الفئة الصناعية": cat, "درجة الصناعة": grade, "المساحة الإجمالية م2": area,
            "قرار التخصيص": s(dec_raw), "تاريخ التخصيص": date, "الحالة الحالية": "ملغى",
        }, review=review + [cat_note, "رقم الإضبارة غير موجود في شيت طلبات الطي"],
            src={"sheet": "طلبات طي قرار الغاء", "row": r})
        alloc["_id"] = aid
        add_decision(ADRA, dec_raw, date, "تخصيص")
        plots, prv, tags = link_plots(ADRA, aid, None, plot, area, plot_class="صناعي")
        alloc["_plotTags"] = sorted(tags)
        cdate, _ = to_date(cdate_raw)
        if cancel_raw:
            rec("events", {"المدينة": ADRA, "رقم الإضبارة": None, "رقم المقسم": plots[0] if plots else None,
                           "نوع الحدث": "إلغاء تخصيص", "رقم القرار / الوثيقة": s(cancel_raw),
                           "تاريخ الحدث": cdate}, alloc=aid)
            add_decision(ADRA, cancel_raw, cdate, "إلغاء")
        else:
            alloc["_review"].append("قرار الإلغاء وتاريخه غير موجودين في هذا السطر")
        m_no = re.search(r"(?:رقم|الكتاب رقم|أموال)\s*(\d{3,5})", note)
        m_dt = re.search(r"تاريخ\s*([\d/]+)", note)
        req_date, rk = to_date(m_dt.group(1)) if m_dt else (None, None)
        ev_rv = [f"تاريخ الطلب غير صالح: «{m_dt.group(1)}»"] if rk == "invalid" else []
        rec("events", {
            "المدينة": ADRA, "رقم الإضبارة": None, "رقم المقسم": plots[0] if plots else None,
            "نوع الحدث": "طلب استرداد أموال" if "استرداد" in note else "طلب طي إلغاء",
            "رقم القرار / الوثيقة": s(cancel_raw), "تاريخ الحدث": req_date,
            "تاريخ تقديم الطلب": req_date, "رقم الطلب الوارد": m_no.group(1) if m_no else None,
            "حالة الطلب": "مقدم", "التفاصيل": note or None,
        }, alloc=aid, review=ev_rv)
        add_raw(aid, raw_row(self.fold, r, "شيت طلبات طي قرار الإلغاء"))
        return alloc

    # ── دمج مقاسم 2026 ──
    def build_merge(self, r: int):
        g = lambda c: self.merge.get(r, c)
        aid = f"ADR-دمج-r{r}"
        cat, grade, _, cat_note = norm_category(g(1))
        date, _ = to_date(g(5))
        area, _ = num(g(3))
        inv = get_investor(ADRA, g(2))
        alloc = rec("allocations", {
            "المدينة": ADRA, "رقم الإضبارة": None, "رمز المستثمر": inv, "الفئة الصناعية": cat,
            "درجة الصناعة": grade, "المساحة الإجمالية م2": area, "قرار التخصيص": s(g(4)),
            "تاريخ التخصيص": date, "الحالة الحالية": "فعّال",
        }, review=[cat_note, "رقم الإضبارة غير موجود في شيت دمج مقاسم 2026"],
            src={"sheet": "دمج مقاسم2026", "row": r})
        alloc["_id"] = aid
        add_decision(ADRA, g(4), date, "تخصيص")
        plots, prv, tags = link_plots(ADRA, aid, None, g(0), area, sector=norm_sector(g(7)), plot_class="صناعي")
        alloc["_plotTags"] = sorted(tags)
        count, _ = num(g(6))
        rec("events", {
            "المدينة": ADRA, "رقم الإضبارة": None, "نوع الحدث": "دمج", "رقم القرار / الوثيقة": None,
            "تاريخ الحدث": None, "القيمة المعدّلة": " + ".join(plots),
            "التفاصيل": f"دمج {count or len(plots)} مقاسم (شيت دمج مقاسم 2026)",
        }, alloc=aid, review=["تاريخ الدمج ورقم قراره غير مذكورين في الشيت"])
        add_raw(aid, raw_row(self.merge, r, "شيت دمج مقاسم 2026", header_row=2))
        return alloc


# ═════════════════════════ حسياء ═════════════════════════

INST_COLS = {1: (56, 57, 71), 2: (58, 59, 60), 3: (61, 62, 63), 4: (64, 65, 66), 5: (67, 68, 69),
             6: (70, 72, 73), 7: (74, 75, 76), 8: (77, 78, 79), 9: (80, 81, 82), 10: (83, 84, 85),
             11: (86, 87, 88), 12: (89, 90, 91), 13: (92, 93, 94), 14: (95, 96, 97)}
AR_COUNT = {"قسط واحد": 1, "قسطين": 2, "ثلاثة أقساط": 3, "أربعة أقساط": 4, "خمسة أقساط": 5}
LEASE_MONTHS = {"سنة": 12, "سنة واحدة": 12, "سنة ميلادية": 12, "سنتين": 24, "سنتان": 24, "2سنة": 24,
                "ثلاث سنوات": 36, "خمس سنوات": 60, "5سنوت": 60, "ستة اشهر": 6, "سنة ونصف": 18,
                "سنة وخمسة شهور": 17, "خمسة عشر سنة": 180, "عشر سنوات": 120}
UNIT_MAP = {"طن": "طن", "كغ": "كغ", "ليتر": "لتر", "لتر": "لتر", "م3": "م3", "قطعة": "قطعة"}


def overdue_count(text) -> int | None:
    t = s(text) or ""
    if t.startswith("مسدد"):
        return 0
    for k, v in AR_COUNT.items():
        if k in t:
            return v
    return None


def lease_months(raw):
    t = s(raw)
    if not t:
        return None, None
    if "\n" in str(raw):
        return None, f"أكثر من مدة في خلية واحدة: «{t}»"
    if t in LEASE_MONTHS:
        return LEASE_MONTHS[t], None
    m = re.fullmatch(r"(\d+)\s*(سنوات|سنة|سنوت|شهر|اشهر|أشهر)", t)
    if m:
        n = int(m.group(1))
        return (n if "شهر" in m.group(2) else n * 12), None
    return None, f"مدة غير مفهومة: «{t}»"


def parse_production(raw):
    t = s(raw)
    if not t:
        return [], []
    found = re.findall(r"(\d+(?:\.\d+)?)\s*([^\d\s/]+)(?:\s*/\s*يوم)?\s*([^\d]*)", t)
    items, review = [], []
    for qty, unit, product in found:
        unit_n = UNIT_MAP.get(unit)
        product = product.strip(" /") or None
        if not unit_n:
            product = " ".join(x for x in (unit, product) if x)
        items.append({"qty": float(qty) if "." in qty else int(qty), "unit": unit_n, "product": product,
                      "period": "سنوي" if "سنوي" in t else "يومي"})
    if len(items) > 1:
        review.append(f"خلية واحدة فيها {len(items)} منتجات: «{t}» — فُصلت آلياً")
    if any(i["unit"] is None for i in items):
        review.append("وحدة خارج القائمة المرجعية")
    if not items:
        review.append(f"تعذّر فهم الطاقة الإنتاجية: «{t}»")
    return items, review


def split_phones(raw):
    t = s0(raw)
    if not t:
        return [], None, []
    fax = None
    fm = re.search(r"fax\s*:?\s*([\d\-+ ]+)", t, re.I)
    if fm:
        fax = fm.group(1).strip()
        t = t[: fm.start()]
    nums = re.findall(r"\+?\d[\d ]{4,}\d", t)
    nums = [n.replace(" ", "") for n in nums]
    rv = []
    if len(nums) > 1 or re.search(r"[^\d\s\-+/]", t):
        rv.append(f"خلية الهاتف فيها أكثر من قيمة أو نص: «{t}»")
    return nums, fax, rv


class Hasya:
    MAIN = {"id": 0, "file": 1, "plot": 2, "sector": 3}
    CANCELLED = {"id": 1, "file": 2, "plot": 3, "sector": None}

    def __init__(self, wb):
        self.main = Sheet(wb["شامل"])
        self.c25 = Sheet(wb["المفصولين 2025"])
        self.old = Sheet(wb["المفصولين قبل 2025"])
        self.km = Sheet(wb["كامل المقاسم"])
        self.xy = Sheet(wb["X and Y"])
        self.km_by_plot: dict[str, int] = {}
        for r in self.km.data_rows():
            for p in split_plots(self.km.get(r, 1))[0]:
                self.km_by_plot.setdefault(p, r)
        self.xy_by_plot = {}
        for r in self.xy.data_rows():
            for p in split_plots(self.xy.get(r, 0))[0]:
                self.xy_by_plot.setdefault(p, (self.xy.get(r, 3), self.xy.get(r, 4)))
        self.file_counts = collections.Counter(s(self.main.get(r, 1)) for r in self.main_rows())

    def main_rows(self):
        return [r for r in self.main.data_rows() if s(self.main.get(r, 5))]

    def plot_lookup(self, p):
        r = self.km_by_plot.get(p)
        x, y = self.xy_by_plot.get(p, (None, None))
        if not r:
            return {"X خط الطول": num(x)[0], "Y خط العرض": num(y)[0]}
        g = lambda c: self.km.get(r, c)
        merged = "+" in str(g(1))
        svc = s(g(8))
        volt = s(g(9))
        return {
            "المنطقة / القطاع": norm_sector(g(2)),
            "المساحة م2": None if merged else num(g(3))[0],
            "تصنيف المقسم": norm_plot_class(g(5)),
            "حالة الخدمة": "غير مخدم" if svc and svc.replace(" ", "") == "غيرمخدم" else svc,
            "التوتر الكهربائي": volt if volt in ("منخفض", "متوسط") else None,
            "X خط الطول": num(x)[0], "Y خط العرض": num(y)[0],
            "ملاحظات": " · ".join(x for x in (s(g(10)), f"التوتر: {volt}" if volt and volt not in ("منخفض", "متوسط") else None) if x) or None,
        }

    def build(self, sh: Sheet, r: int, cols: dict, cancelled: bool):
        g = lambda c: sh.get(r, c)
        tag = "مفصولين2025" if cancelled else "شامل"
        aid = f"HSY-{tag}-r{r}"
        review = []
        file_no = s(g(cols["file"]))
        if not file_no:
            review.append("رقم الإضبارة فارغ في الملف الأصلي")
        info = [f"رقم الإضبارة {file_no} يتكرر {self.file_counts[file_no]} مرة في شيت شامل"]             if file_no and not cancelled and self.file_counts[file_no] > 1 else []
        cat, _, _, cat_note = norm_category(g(12))
        date, dkind = to_date(g(22))
        area, area_issue = num(g(10))
        women = s0(g(9))
        phones, fax, phone_rv = split_phones(g(43))
        email = s0(g(45))
        if email and "@" not in email:
            phone_rv.append(f"عمود البريد الإلكتروني يحتوي رقماً: «{email}»")
            email = None
        contact = {"fields": {
            "العنوان": s0(g(42)), "الهاتف 1": phones[0] if phones else None,
            "الهاتف 2": s0(g(44)) or (phones[1] if len(phones) > 1 else None), "الفاكس": fax,
            "البريد الإلكتروني": email, "اسم الوكيل القانوني": s0(g(46)), "هاتف الوكيل القانوني": s0(g(47)),
        }, "review": phone_rv}
        nat = g(7)
        if s(nat):
            NATIONALITIES_SEEN.add(s(nat))
        inv = get_investor(HASYA, g(5), s0(g(6)), nationality=nat, docs=g(8), women=women, contact=contact)
        legal = norm_legal(g(18))
        dec_id = add_decision(HASYA, g(21), date, "تخصيص", legal=legal)
        op = s(g(36))
        tenant_holder = None
        if op and "للمستأجر" in op:
            tenant_holder = op.split("للمستأجر", 1)[1].strip()
            op = "ترخيص إداري مؤقت"
        NORM.note("الوضع التشغيلي", g(36), op)
        alloc = rec("allocations", {
            "المدينة": HASYA, "رقم الإضبارة": file_no, "الرقم التسلسلي": s(g(cols["id"])),
            "رمز المستثمر": inv, "الفئة الصناعية": cat, "درجة الصناعة": s(g(15)),
            "نوع الصناعة": s(g(14)), "وصف النشاط": s(g(13)), "المساحة الإجمالية م2": area,
            "قرار التخصيص": s(g(21)), "تاريخ التخصيص": date, "السند القانوني": legal,
            "الحالة الحالية": "ملغى" if cancelled else "فعّال", "الوضع التشغيلي": op,
        }, review=review + [cat_note, area_issue], src={"sheet": sh.title, "row": r}, _decision=dec_id,
            _dateKind=dkind, _info=info)
        alloc["_id"] = aid
        sector = norm_sector(g(cols["sector"])) if cols["sector"] is not None else None
        plots, prv, tags = link_plots(HASYA, aid, file_no, g(cols["plot"]), area, sector=sector,
                                      phase=norm_phase(g(11)), plot_class=norm_plot_class(g(4)),
                                      extra_lookup=self.plot_lookup)
        alloc["_review"] += prv
        alloc["_plotTags"] = sorted(tags)
        if len(plots) == 1:
            pid = f"{HASYA}|{plots[0]}"
            x, _ = num0(g(103))
            y, _ = num0(g(104))
            if x and PLOTS[pid]["X خط الطول"] is None:
                PLOTS[pid]["X خط الطول"], PLOTS[pid]["Y خط العرض"] = x, y

        # التراخيص الصناعية
        if s0(g(16)):
            idate, ik = to_date(g(17))
            issuer = norm_issuer(g(19))
            rec("industrial_licenses", {
                "المدينة": HASYA, "رقم الإضبارة": file_no, "رقم القرار الصناعي": s(g(16)),
                "تاريخ القرار": idate, "السند القانوني": legal, "الجهة المصدرة": issuer,
                "الصناعة المرخصة": s(g(13)), "يعدّل الترخيص رقم": s0(g(20)),
            }, alloc=aid, review=["تاريخ القرار الصناعي مكتوب كنص" if ik == "text" else None])
            add_decision(HASYA, g(16), idate, "ترخيص", legal=legal, issuer=issuer)
        # رخص البناء
        if s0(g(32)) or s0(g(35)):
            bdate, bk = to_date(g(33))
            barea, barea_issue = num0(g(34))
            brv = [barea_issue]
            if bk == "double":
                brv.append(f"خلية تاريخ الرخصة فيها أكثر من تاريخ: «{s(g(33))}» — يجب أن يصبح كل تجديد سطراً مستقلاً")
            rec("building_licenses", {
                "المدينة": HASYA, "رقم الإضبارة": file_no, "رقم رخصة البناء": s0(g(32)),
                "تاريخ الرخصة": bdate, "نوع": None, "المساحة المرخصة م2": barea, "حالة الترخيص": s(g(35)),
            }, alloc=aid, review=brv)
        # التراخيص الإدارية
        if s0(g(37)) or s0(g(38)):
            adate, _ = to_date(g(38))
            edate, _ = to_date(g(40))
            d = s(g(39)) or ""
            duration = "دائم" if d == "نهائي" else ("مؤقت" if "مؤقت" in d else None)
            NORM.note("المدة", g(39), duration)
            rec("admin_licenses", {
                "المدينة": HASYA, "رقم الإضبارة": file_no, "رقم الرخصة الإدارية": None,
                "رقم القرار": s0(g(37)), "تاريخ الترخيص": adate, "المدة": duration, "تاريخ الانتهاء": edate,
                "النطاق": s(g(41)), "صاحب الترخيص": "المستأجر" if tenant_holder else "المستثمر",
                "رمز المستأجر": tenant_holder,
            }, alloc=aid, review=[f"المدة في الأصل: «{d}»" if d and d not in ("نهائي", "مؤقت") else None])
            add_decision(HASYA, g(37), adate, "ترخيص")
        # عقد البيع من المدينة
        if s0(g(25)):
            cdate, _ = to_date(g(26))
            value, v_issue = num0(g(27))
            rec("contracts", {
                "المدينة": HASYA, "رقم الإضبارة": file_no, "نوع العقد": "بيع من المدينة",
                "رقم العقد": s(g(25)), "تاريخ العقد": cdate, "القيمة": value,
                "العملة": "USD" if value else None, "البائع": "المدينة", "الشاري": inv,
                "النسبة المباعة %": None,
            }, alloc=aid, review=[v_issue])
        # أحداث التعديل
        mod = s(g(30))
        if mod:
            self.mod_events(aid, file_no, mod, g(28), g(29), g(31))
        if cancelled:
            cdate, _ = to_date(g(0))
            rec("events", {"المدينة": HASYA, "رقم الإضبارة": file_no, "نوع الحدث": "إلغاء تخصيص",
                           "رقم القرار / الوثيقة": None, "تاريخ الحدث": cdate,
                           "التفاصيل": "من شيت المفصولين 2025"}, alloc=aid,
                review=["رقم قرار الإلغاء غير مذكور في شيت المفصولين"])
        # بيانات المشروع
        vals = {"رأس المال": num0(g(48))[0], "رأس المال بالدولار": num0(g(49))[0], "قيمة الآلات": num0(g(54))[0],
                "الكهرباء kVA": num0(g(50))[0], "المياه م3/سنة": num0(g(51))[0], "عدد العمال الفعلي": num0(g(52))[0]}
        if any(v is not None for v in vals.values()):
            rec("project", {"المدينة": HASYA, "رقم الإضبارة": file_no, "تاريخ التحديث": SNAPSHOT[HASYA],
                            "وحدة رأس المال": "مليون ل.س" if vals["رأس المال"] else None, **vals}, alloc=aid)
        # الطاقة الإنتاجية
        items, prv2 = parse_production(g(53))
        for it in items:
            rec("production", {"المدينة": HASYA, "رقم الإضبارة": file_no, "المنتج": it["product"],
                               "الكمية": it["qty"], "الوحدة": it["unit"], "الفترة": it["period"]},
                alloc=aid, review=prv2)
        if not items and prv2 and s(g(53)):
            alloc["_review"] += prv2
        # الوضع المالي والأقساط
        self.finance(aid, file_no, g)
        # الإيجارات
        if s0(g(105)):
            self.leases(aid, file_no, g)
        add_raw(aid, raw_row(sh, r, f"شيت {sh.title}", mask_cols=(8,)))
        return alloc

    def mod_events(self, aid, file_no, mod, doc, date_raw, new_value):
        date, _ = to_date(date_raw)
        types = []
        if "دمج" in mod:
            types.append("دمج")
        if "تقسيم" in mod:
            types.append("فصل")
        if "شريك" in mod:
            types.append("تعديل شركاء")
        elif "ملكية" in mod or "ورثة" in mod or "ارث" in mod:
            pct = re.search(r"(\d+)\s*%", mod)
            if "كامل" in mod or (pct and pct.group(1) == "100"):
                types.append("نقل ملكية كامل")
            elif pct or "حصة" in mod or "جزء" in mod:
                types.append("نقل ملكية جزئي")
            else:
                types.append(None)
        if "صناع" in mod or "نشاط" in mod:
            types.append("إضافة/تعديل صناعة")
        if "إعادة تخص" in mod:
            types.append("إعادة تخصيص")
        if not types:
            types.append(None)
        pct = re.search(r"(\d+)\s*%", mod)
        for t in types:
            rv = []
            if t is None:
                rv.append(f"نوع التعديل «{mod}» لا يطابق قائمة الأحداث" if "ملكية" not in mod
                          else f"«{mod}»: نقل الملكية كامل أم جزئي؟ غير محدد في المصدر")
            if len(types) > 1:
                rv.append(f"خلية (نوع التعديل) تجمع أكثر من حدث: «{mod}»")
            rec("events", {
                "المدينة": HASYA, "رقم الإضبارة": file_no, "نوع الحدث": t, "رقم القرار / الوثيقة": s0(doc),
                "تاريخ الحدث": date, "النسبة المنقولة %": int(pct.group(1)) if pct and t and "ملكية" in t else None,
                "القيمة المعدّلة": s0(new_value), "التفاصيل": f"نوع التعديل في الأصل: {mod}",
            }, alloc=aid, review=rv)

    def finance(self, aid, file_no, g):
        land = s(g(101))
        diff = s(g(99))
        first, _ = num0(g(55))
        price, _ = num0(g(102))
        if not any((land, diff, first, price)):
            return
        ptype = "نهائي" if (land and "نهائي" in land) or s(g(98)) == "سعر نهائي" else (
            "مبدئي" if land and "مبدئي" in land else None)
        rec("financial", {
            "المدينة": HASYA, "رقم الإضبارة": file_no, "سعر المتر": price, "العملة": "ل.س" if price else None,
            "نوع السعر": ptype, "القيمة الإجمالية": None, "الدفعة الأولى": first,
            "نظام الدفع": s(g(100)), "حالة أقساط الأرض": land, "حالة فرق السعر": diff, "قيمة فرق السعر": None,
        }, alloc=aid)
        due_n = overdue_count(land)
        rows = []
        if first:
            rows.append((0, first, None, None, None))
        for k, (ca, cd, cp) in INST_COLS.items():
            amount, _ = num0(g(ca))
            due, dk = to_date(g(cd))
            paid, _ = to_date(g(cp))
            if amount is None and due is None:
                continue
            rows.append((k, amount, due, paid, dk))
        past_unpaid = [k for k, a, due, paid, _ in rows if k and due and due <= TODAY.isoformat() and not paid]
        late = set(past_unpaid[-due_n:]) if due_n else set()
        for k, amount, due, paid, dk in rows:
            if paid:
                status, basis = "مدفوع", "تاريخ الدفع مسجل"
            elif k == 0:
                status, basis = "مسدد (مستنتج)" if due_n is not None else "غير معروف", "الدفعة الأولى"
            elif due and due > TODAY.isoformat():
                status, basis = "غير مستحق بعد", "تاريخ الاستحقاق لاحق"
            elif due_n is None:
                status, basis = "غير معروف", "لا يوجد تاريخ دفع ولا حالة مالية واضحة"
            elif k in late:
                status, basis = "متأخر", f"مستنتج من الحالة المالية: «{land}»"
            else:
                status, basis = "مسدد (مستنتج)", f"مستنتج من الحالة المالية: «{land}»"
            rv = []
            if k == 1 and paid:
                rv.append("تاريخ دفع القسط 1 موجود في عمود القسط 6 (BT) — عمود في غير مكانه")
            if dk == "text":
                rv.append("تاريخ الاستحقاق مكتوب كنص")
            rec("installments", {
                "المدينة": HASYA, "رقم الإضبارة": file_no, "نوع القسط": "قسط أرض", "رقم القسط": k,
                "المبلغ المستحق": amount, "العملة": "ل.س", "تاريخ الاستحقاق": due, "تاريخ الدفع": paid,
                "المبلغ المدفوع": None, "رقم الإيصال": None,
            }, alloc=aid, review=rv, _status=status, _statusBasis=basis)

    def leases(self, aid, file_no, g):
        names = [re.sub(r"^\d+\s*-\s*", "", x).strip() for x in str(g(105)).split("\n") if x.strip()]
        months, m_issue = lease_months(g(109))
        date, dk = to_date(g(107))
        area, a_issue = num0(g(108))
        rv = [m_issue, a_issue]
        if len(names) > 1:
            rv.append(f"خلية المستأجر فيها {len(names)} أسماء — فُصلت لسطور")
        for n in names:
            rec("leases", {
                "المدينة": HASYA, "رقم الإضبارة (المؤجر)": file_no, "اسم المستأجر": n,
                "هاتف المستأجر": s0(g(111)), "رقم عقد الإيجار": s0(g(106)), "تاريخ العقد": date,
                "المساحة المؤجرة م2": area, "مدة العقد (أشهر)": months, "تاريخ الانتهاء": None,
                "الصناعة حسب العقد": s0(g(110)),
            }, alloc=aid, review=rv, _durationRaw=s(g(109)))

    # ── المفصولين قبل 2025 (تخطيط أعمدة مختلف) ──
    def build_old(self, r: int):
        sh = self.old
        g = lambda c: sh.get(r, c)
        aid = f"HSY-مفصولين-قديم-r{r}"
        cat, _, _, cat_note = norm_category(g(7))
        date, dk = to_date(g(15))
        area, _ = num(g(5))
        nat = s(g(3))
        inv = get_investor(HASYA, g(1), s0(g(2)), nationality=nat)
        legal = norm_legal(g(11))
        alloc = rec("allocations", {
            "المدينة": HASYA, "رقم الإضبارة": None, "الرقم التسلسلي": s(g(0)), "رمز المستثمر": inv,
            "الفئة الصناعية": cat, "وصف النشاط": s(g(8)), "المساحة الإجمالية م2": area,
            "قرار التخصيص": s(g(14)), "تاريخ التخصيص": date, "السند القانوني": legal,
            "الحالة الحالية": "ملغى", "الوضع التشغيلي": None, "ملاحظات": s(g(27)),
        }, review=[cat_note, "رقم الإضبارة غير موجود في شيت المفصولين قبل 2025"] +
            ([f"تاريخ التخصيص «{s(g(15))}» ليس بصيغة يوم/شهر/سنة — لم يُخمَّن"] if dk == "invalid" else []),
            src={"sheet": sh.title, "row": r}, _dateKind=dk)
        alloc["_id"] = aid
        add_decision(HASYA, g(14), date, "تخصيص", legal=legal)
        plots, prv, tags = link_plots(HASYA, aid, None, g(4), area, phase=norm_phase(g(6)),
                                      plot_class="صناعي", extra_lookup=self.plot_lookup)
        alloc["_review"] += prv
        alloc["_plotTags"] = sorted(tags)
        if any(sh.get(r, c) == "#######" for c in range(28, 94)):
            alloc["_review"].append("خلايا الأقساط تظهر (#######) — قيم تالفة أو عرض عمود ضيق")
        rec("events", {"المدينة": HASYA, "رقم الإضبارة": None, "نوع الحدث": "إلغاء تخصيص",
                       "رقم القرار / الوثيقة": None, "تاريخ الحدث": None,
                       "التفاصيل": f"من شيت المفصولين قبل 2025 — الوضع: {s(g(20)) or '—'}"}, alloc=aid,
            review=["تاريخ ورقم قرار الفصل غير مذكورين"])
        add_raw(aid, raw_row(sh, r, "شيت المفصولين قبل 2025"))
        return alloc


# ═════════════════════════ اختيار العينة ═════════════════════════

def pick(pool, n, chosen: list, cond=lambda r: True):
    cands = [r for r in pool if r not in chosen and cond(r)]
    random.shuffle(cands)
    chosen.extend(cands[:n])


def adra_sample(a: Adra) -> dict[str, list[int]]:
    rows = a.fz_rows()
    g = lambda r, c: a.fz.get(r, c)
    plot_s = lambda r: str(g(r, 3))
    plots_of = lambda r: split_plots(g(r, 3))[0]
    chosen: list[int] = []
    merged_rows = {r for (r, c) in a.fz.merged if c < 20}
    pick(rows, 14, chosen, lambda r: r in merged_rows)
    pick(rows, 16, chosen, lambda r: "+" in plot_s(r) and "\\" not in plot_s(r))
    pick(rows, 10, chosen, lambda r: "\\" in plot_s(r))
    pick(rows, 6, chosen, lambda r: "/" in plot_s(r))
    pick(rows, 4, chosen, lambda r: "-" in plot_s(r) or re.search(r"[^\d+/\\\s]", plot_s(r)))
    pick(rows, 6, chosen, lambda r: to_date(g(r, 10))[1] == "double")
    pick(rows, 8, chosen, lambda r: to_date(g(r, 10))[1] == "text")
    pick(rows, 22, chosen, lambda r: any(similar(a.sold.get(x, 8), g(r, 5)) for p in plots_of(r) for x in a.sold_by_plot.get(p, [])))
    pick(rows, 10, chosen, lambda r: any(p in a.misc_by_plot for p in plots_of(r)))
    pick(rows, 8, chosen, lambda r: any(p in a.law_by_plot for p in plots_of(r)))
    pick(rows, 5, chosen, lambda r: any(p in a.subs_by_plot for p in plots_of(r)))
    pick(rows, 6, chosen, lambda r: s(g(r, 2)) == "2")
    pick(rows, 6, chosen, lambda r: "سجل تجاري" in str(g(r, 5)))
    pick(rows, 6, chosen, lambda r: re.search(r"أبناء|ابناء|بنات", str(g(r, 5))))
    pick(rows, 4, chosen, lambda r: s(g(r, 18)) and "تمت" not in s(g(r, 18)))
    pick(rows, 112 - len(chosen), chosen)
    chosen = chosen[:112]

    brow = [r for r in a.black.data_rows() if s(a.black.get(r, 1)) and s(a.black.get(r, 2))
            and "ليست الغاء" not in str(a.black.get(r, 11))]
    reason = lambda r: " ".join(str(a.black.get(r, c) or "") for c in (11, 12, 13))
    bl: list[int] = []
    pick(brow, 3, bl, lambda r: "تبديل مقسم" in reason(r))
    pick(brow, 2, bl, lambda r: s(a.black.get(r, 0)) == "دمج مقاسم")
    pick(brow, 4, bl, lambda r: any(a.black.merged.get((r, c)) for c in range(11, 14)))
    pick(brow, 3, bl, lambda r: "+" in str(a.black.get(r, 2)))
    pick(brow, 3, bl, lambda r: isinstance(a.black.get(r, 10), str))
    pick(brow, 23 - len(bl), bl)

    seen, folds = set(), []
    for r in a.fold.data_rows():
        k = (str(a.fold.get(r, 0)), str(a.fold.get(r, 1)), str(a.fold.get(r, 2)))
        if k not in seen and a.fold.get(r, 0) is not None:
            seen.add(k)
            folds.append(r)
    return {"fz": chosen, "black": bl, "fold": folds, "merge": list(a.merge.data_rows(3))}


def hasya_sample(h: Hasya) -> dict[str, list[int]]:
    rows = h.main_rows()
    g = lambda r, c: h.main.get(r, c)
    chosen: list[int] = []
    pick(rows, 5, chosen, lambda r: any(isinstance(g(r, c), (int, float)) and g(r, c) for c in (56, 58)))
    pick(rows, 3, chosen, lambda r: g(r, 71) is not None)
    pick(rows, 12, chosen, lambda r: "+" in str(g(r, 2)))
    pick(rows, 4, chosen, lambda r: re.search(r"/\d+\+\d+$", str(g(r, 2))))
    pick(rows, 8, chosen, lambda r: "/" in str(g(r, 2)) and "+" not in str(g(r, 2)))
    pick(rows, 5, chosen, lambda r: (overdue_count(g(r, 101)) or 0) > 0 and g(r, 57) is not None)
    pick(rows, 10, chosen, lambda r: (overdue_count(g(r, 101)) or 0) > 0)
    pick(rows, 6, chosen, lambda r: (overdue_count(g(r, 99)) or 0) > 0)
    pick(rows, 16, chosen, lambda r: s0(g(r, 105)) is not None)
    pick(rows, 5, chosen, lambda r: "للمستأجر" in str(g(r, 36)))
    pick(rows, 10, chosen, lambda r: s0(g(r, 37)) is not None)
    pick(rows, 6, chosen, lambda r: to_date(g(r, 33))[1] == "double")
    pick(rows, 14, chosen, lambda r: s(g(r, 30)) is not None)
    pick(rows, 4, chosen, lambda r: s(g(r, 1)) is None)
    pick(rows, 6, chosen, lambda r: s(g(r, 7)) not in (None, "سوريا"))
    pick(rows, 4, chosen, lambda r: s0(g(r, 9)) is not None)
    pick(rows, 4, chosen, lambda r: len(parse_production(g(r, 53))[0]) > 1)
    pick(rows, 3, chosen, lambda r: "المصرف" in str(g(r, 5)))
    pick(rows, 125 - len(chosen), chosen)
    chosen = chosen[:125]
    c25 = [r for r in h.c25.data_rows() if s(h.c25.get(r, 5))]
    random.shuffle(c25)
    old = [r for r in h.old.data_rows() if s(h.old.get(r, 1))]
    random.shuffle(old)
    return {"main": chosen, "c25": c25[:15], "old": old[:10]}


# ═════════════════════════ تقرير الجودة ═════════════════════════

class Quality:
    def __init__(self):
        self.issues: dict[str, dict] = {}

    def define(self, key, title, desc, severity="متوسط", fix=""):
        self.issues[key] = {"id": key, "title": title, "desc": desc, "severity": severity, "fix": fix,
                            "counts": {ADRA: 0, HASYA: 0}, "examples": []}

    def hit(self, key, city, sheet=None, row=None, col=None, value=None, note=None, n=1):
        it = self.issues[key]
        it["counts"][city] += n
        per_city = sum(1 for e in it["examples"] if e["city"] == city)
        if value is not None and per_city < 6 and random.random() < 0.6 + 0.4 * (per_city < 2):
            it["examples"].append({"city": city, "sheet": sheet, "row": row, "col": col,
                                   "value": str(value)[:220], "note": note})


def build_quality(a: Adra, h: Hasya) -> dict:
    Q = Quality()
    Q.define("merged_plots", "مقاسم مدموجة في خلية واحدة", "أكثر من مقسم في خانة واحدة مفصولة بـ + (مثل 578+777).",
             "مرتفع", "تُفكك إلى سطور في جدول (مقاسم التخصيص)")
    Q.define("subplot_separator", "فاصل المقسم الفرعي غير موحد", "المقسم الفرعي يُكتب بـ \\ في عدرا وبـ / في حسياء (16\\5 و146/5).",
             "متوسط", "الفاصل الموحد: /  والقيمة الأصلية تُحفظ في (رقم المقسم كما ورد)")
    Q.define("plot_odd", "رقم مقسم غير مفهوم", "رقم مقسم فيه نص أو فاصل (-) أو + زائدة أو جزء فرعي بلا بلوك (113/8+9).",
             "مرتفع", "مراجعة يدوية — لا يُخمَّن")
    Q.define("text_dates", "تواريخ مكتوبة كنص", "التاريخ مخزن كنص (يوم/شهر/سنة) بدل خلية تاريخ.",
             "متوسط", "تحويل آلي إلى yyyy-mm-dd")
    Q.define("double_dates", "خلية فيها أكثر من تاريخ", "مثل 4/4/2005+12/11/2006 أو تاريخان لرخصة بناء وتجديدها.",
             "مرتفع", "needs_review — كل تاريخ يصبح سطراً/حدثاً مستقلاً بعد التأكد")
    Q.define("invalid_dates", "تاريخ غير صالح", "تاريخ لا يمكن أن يكون حقيقياً (شهر 14، سنة 8026…) أو بصيغة شهر/يوم.",
             "مرتفع", "مراجعة يدوية")
    Q.define("dup_file_no", "رقم الإضبارة غير فريد", "نفس رقم الإضبارة يتكرر لمستثمرين مختلفين.",
             "مرتفع", "مفتاح داخلي مؤقت (ADR-فرز-r123) حتى حسم قاعدة الترقيم")
    Q.define("missing_file_no", "رقم الإضبارة فارغ", "سجلات بدون رقم إضبارة (حقل إلزامي).", "مرتفع", "استكمال من الأرشيف")
    Q.define("nonstandard", "قيم غير موحدة لنفس المعنى", "نفس القيمة مكتوبة بأكثر من شكل (قانون 21 / القانون 21 / قانون21…).",
             "متوسط", "قوائم مرجعية منسدلة")
    Q.define("name_mixed", "الاسم يحوي شركاء وسجل تجاري", "خانة الاسم تجمع اسم الشركة والشركاء ورقم السجل التجاري وتاريخه.",
             "متوسط", "تفكيك إلى (المستثمرون) و(الشركاء) وحقل السجل التجاري")
    Q.define("multi_value", "أكثر من قيمة في خلية واحدة", "عدة أرقام هواتف، أو جنسيات، أو مستأجرين، أو منتجات في خلية واحدة.",
             "متوسط", "قيمة واحدة في كل خانة")
    Q.define("units_in_numbers", "أرقام مع وحدات أو نصوص", "مثل (سنتين) لمدة الإيجار، (310كغ بودرة) للطاقة الإنتاجية، (250-74) للمساحة.",
             "متوسط", "الأرقام بدون وحدات، والوحدة حقل مستقل")
    Q.define("excel_errors", "أخطاء إكسل داخل البيانات", "خلايا #N/A أو ####### محفوظة كقيم.", "منخفض", "تُعامل كفارغة")
    Q.define("merged_cells", "خلايا مدموجة", "خلية مدموجة تغطي أكثر من سطر/عمود، فتضيع القيمة عند الفرز والتصفية.",
             "متوسط", "سطر واحد = سجل واحد")
    Q.define("shifted_columns", "أعمدة مزاحة عن عناوينها", "سطور أو كتل أعمدة لا تطابق العناوين (طلبات الطي، النسخة المكررة في بلاك).",
             "مرتفع", "قالب إدخال ثابت")
    Q.define("wrong_content", "محتوى في عمود غير مخصص له", "أرقام هواتف في (تمت التسوية)، اسم مدينة في (الجنسية)، رقم في (Email)، تاريخ دفع في عمود قسط آخر.",
             "متوسط", "تحقق من النوع عند الإدخال")
    Q.define("header_rows", "عناوين وفواصل داخل البيانات", "سطور عناوين أو سنوات مكررة بين السجلات في شيت فرز.", "منخفض", "تُحذف")
    Q.define("stored_counts", "قيم محسوبة مخزنة وغير متطابقة", "عمود (عدد المقاسم) لا يطابق عدد المقاسم الفعلي في الخانة.",
             "منخفض", "لا تُكتب، بل تُحسب")
    Q.define("sensitive_ids", "أرقام هويات وجوازات مكشوفة", "أرقام وثائق شخصية بنص واضح في الملف.",
             "مرتفع", "حُجبت في الديمو (●●●●1234) — صلاحية اطلاع محددة")
    Q.define("pay_dates_missing", "تواريخ دفع الأقساط غير مسجلة", "الأقساط لها تواريخ استحقاق لكن تاريخ الدفع شبه فارغ؛ الحالة مكتوبة نصاً (مستحق عليه قسطين).",
             "مرتفع", "كل دفعة سطر في جدول الأقساط مع تاريخ دفع")
    Q.define("wide_installments", "الأقساط في أعمدة عريضة", "14 قسطاً × 3 أعمدة = 42 عموداً لكل منشأة.", "منخفض",
             "سطر لكل قسط")

    # ── عدرا ──
    NORM.city = ADRA
    rows = a.fz_rows()
    for sheet, sh, rs, pc, dcs in (("فرز", a.fz, rows, 3, (10,)),
                                    ("بلاك", a.black, list(a.black.data_rows()), 2, (7, 10))):
        for r in rs:
            raw = sh.get(r, pc)
            _, rv, tags = split_plots(raw)
            if "merged" in tags:
                Q.hit("merged_plots", ADRA, sheet, r, get_column_letter(pc + 1), raw)
            if "backslash" in tags:
                Q.hit("subplot_separator", ADRA, sheet, r, get_column_letter(pc + 1), raw)
            if tags & {"text", "dash", "dangling", "partial"}:
                Q.hit("plot_odd", ADRA, sheet, r, get_column_letter(pc + 1), raw, rv[0] if rv else None)
            for dc in dcs:
                v = sh.get(r, dc)
                _, k = to_date(v)
                key = {"text": "text_dates", "double": "double_dates", "invalid": "invalid_dates"}.get(k)
                if key:
                    Q.hit(key, ADRA, sheet, r, get_column_letter(dc + 1), v)
    for r in a.fz.data_rows():
        if not a.is_alloc_row(r):
            Q.hit("header_rows", ADRA, "فرز", r, None, " | ".join(str(v) for v in a.fz.rows[r][:6] if v is not None))
    for fno, n in a.file_counts.items():
        if fno and n > 1:
            Q.hit("dup_file_no", ADRA, "فرز", None, "C", f"رقم الإضبارة {fno}", f"يتكرر {n} مرة")
    for r in rows:
        name = str(a.fz.get(r, 5))
        if "سجل تجاري" in name or ("شركة" in name and "(" in name):
            Q.hit("name_mixed", ADRA, "فرز", r, "F", name)
        st = s(a.fz.get(r, 18))
        if st and "تمت" not in st and re.fullmatch(r"[\d+ ]{7,}", st):
            Q.hit("wrong_content", ADRA, "فرز", r, "S", st, "رقم هاتف في عمود (تمت التسوية)")
        cnt, _ = num(a.fz.get(r, 12))
        n = len(split_plots(a.fz.get(r, 3))[0])
        if cnt and n and cnt != n:
            Q.hit("stored_counts", ADRA, "فرز", r, "M", f"{a.fz.get(r, 3)} ← عدد المقاسم = {cnt}")
        for c, field in ((4, "الفئة الصناعية"), (13, "المرحلة الجغرافية"), (14, "المنطقة / القطاع")):
            v = a.fz.get(r, c)
            {4: norm_category, 13: norm_phase, 14: norm_sector}[c](v)
        _, issue = num(a.fz.get(r, 6))
        if issue:
            Q.hit("units_in_numbers", ADRA, "فرز", r, "G", a.fz.get(r, 6))
    for sh in (a.fz, a.black, a.fold, a.sold):
        if sh.merged_ranges:
            Q.hit("merged_cells", ADRA, sh.title, None, None, ", ".join(sh.merged_ranges[:4]),
                  f"{len(sh.merged_ranges)} نطاق مدموج", n=len(sh.merged_ranges))
    for r in a.fold.data_rows():
        if isinstance(a.fold.get(r, 1), int) and isinstance(a.fold.get(r, 3), str):
            Q.hit("shifted_columns", ADRA, a.fold.title, r, "B:D",
                  f"الاسم={a.fold.get(r, 1)} | المقسم={a.fold.get(r, 2)} | الصناعة={a.fold.get(r, 3)}",
                  "المقسم تحت عنوان (الاسم) والاسم تحت عنوان (الصناعة)")
    shifted_black = sum(1 for r in a.black.data_rows() if s(a.black.get(r, 18)) and not re.fullmatch(r"\d+", s(a.black.get(r, 18)) or ""))
    Q.hit("shifted_columns", ADRA, "بلاك", 2, "R:AA",
          f"عنوان (ترتيب) تحته: {a.black.get(5, 18)} | عنوان (المقسم) تحته: {a.black.get(5, 19)}",
          f"نسخة مكررة من البيانات بعناوين مزاحة عموداً واحداً ({shifted_black} سطراً)", n=shifted_black)
    not_cancel = sum(1 for r in a.black.data_rows() if "ليست الغاء" in str(a.black.get(r, 11)))
    if not_cancel:
        Q.hit("wrong_content", ADRA, "بلاك", None, "L",
              "ليست الغاء فقط تغيير نوع صناعة وحافظنا على بيانات الاضبارة مع تغيير الارشفة فقط",
              f"{not_cancel} سطراً في شيت الملغاة ليست إلغاءً فعلياً", n=not_cancel)

    # ── حسياء ──
    NORM.city = HASYA
    hrows = h.main_rows()
    g = lambda r, c: h.main.get(r, c)
    for r in hrows:
        raw = g(r, 2)
        _, rv, tags = split_plots(raw)
        if "merged" in tags:
            Q.hit("merged_plots", HASYA, "شامل", r, "C", raw)
        if tags & {"text", "dash", "dangling", "partial", "float"}:
            Q.hit("plot_odd", HASYA, "شامل", r, "C", raw, rv[0] if rv else None)
        for dc in (17, 22, 26, 29, 33, 38, 40, 107):
            v = g(r, dc)
            _, k = to_date(v)
            key = {"text": "text_dates", "double": "double_dates", "invalid": "invalid_dates"}.get(k)
            if key:
                Q.hit(key, HASYA, "شامل", r, get_column_letter(dc + 1), v)
        if not s(g(r, 1)):
            Q.hit("missing_file_no", HASYA, "شامل", r, "B", f"ID={s(g(r, 0))} — {s(g(r, 5))}")
        if s0(g(r, 8)):
            Q.hit("sensitive_ids", HASYA, "شامل", r, "I", mask_id(g(r, 8)))
        for c, label in ((43, "هاتف"), (7, "جنسية"), (105, "مستأجر"), (108, "مساحة مؤجرة")):
            v = g(r, c)
            if v and ("\n" in str(v) or (c == 43 and len(split_phones(v)[0]) > 1)):
                Q.hit("multi_value", HASYA, "شامل", r, get_column_letter(c + 1), v, label)
        items, _ = parse_production(g(r, 53))
        if s(g(r, 53)):
            Q.hit("units_in_numbers", HASYA, "شامل", r, "BB", g(r, 53), "الطاقة الإنتاجية")
            if len(items) > 1:
                Q.hit("multi_value", HASYA, "شامل", r, "BB", g(r, 53), "منتجات")
        if s0(g(r, 109)):
            Q.hit("units_in_numbers", HASYA, "شامل", r, "DF", g(r, 109), "مدة الإيجار")
        if num0(g(r, 34))[1]:
            Q.hit("units_in_numbers", HASYA, "شامل", r, "AI", g(r, 34), "المساحة المرخصة")
        for c in range(len(h.main.rows[r])):
            if h.main.rows[r][c] in ("#N/A", "#######"):
                Q.hit("excel_errors", HASYA, "شامل", r, get_column_letter(c + 1), h.main.rows[r][c])
        email = s0(g(r, 45))
        if email and "@" not in email:
            Q.hit("wrong_content", HASYA, "شامل", r, "AT", email, "رقم في عمود Email")
        if g(r, 71) is not None:
            Q.hit("wrong_content", HASYA, "شامل", r, "BT", g(r, 71), "تاريخ دفع القسط 1 في عمود بين القسط 6 واستحقاقه")
        dues = sum(1 for k, (_, cd, _) in INST_COLS.items() if g(r, cd))
        pays = sum(1 for k, (_, _, cp) in INST_COLS.items() if g(r, cp))
        if dues and not pays:
            Q.hit("pay_dates_missing", HASYA, "شامل", r, "BE:CT",
                  f"{dues} قسطاً بتاريخ استحقاق، 0 تاريخ دفع — الحالة: {s(g(r, 101)) or s(g(r, 99)) or '—'}")
        norm_legal(g(r, 18)); norm_phase(g(r, 11)); norm_category(g(r, 12)); norm_plot_class(g(r, 4))
        norm_sector(g(r, 3)); norm_issuer(g(r, 19))
        if s(g(r, 30)):
            NORM.note("نوع التعديل", g(r, 30), re.sub(r"\s|ال", "", s(g(r, 30))))
    for fno, n in h.file_counts.items():
        if fno and n > 1:
            Q.hit("dup_file_no", HASYA, "شامل", None, "B", f"رقم الإضبارة {fno}", f"يتكرر {n} مرة")
    for r in h.old.data_rows():
        if s(h.old.get(r, 3)) in ("حمص", "دمشق", "حلب"):
            Q.hit("wrong_content", HASYA, "المفصولين قبل 2025", r, "D", h.old.get(r, 3), "اسم مدينة في عمود (الجنسية)")
        for c in range(28, 94):
            if h.old.get(r, c) == "#######":
                Q.hit("excel_errors", HASYA, "المفصولين قبل 2025", r, get_column_letter(c + 1), "#######")
        _, k = to_date(h.old.get(r, 15))
        if k == "invalid":
            Q.hit("invalid_dates", HASYA, "المفصولين قبل 2025", r, "P", h.old.get(r, 15), "شهر/يوم بدل يوم/شهر")
        if s0(h.old.get(r, 2)) or True:
            pass
    for sh in (h.c25,):
        for r in sh.data_rows():
            if s0(sh.get(r, 8)):
                Q.hit("sensitive_ids", HASYA, sh.title, r, "I", mask_id(sh.get(r, 8)))
    Q.hit("wide_installments", HASYA, "شامل", 1, "BD:CT", "القسط 1 | تاريخ استحقاق القسط 1 | القسط 2 | … | القسط14",
          "42 عموداً للأقساط + عمود الدفعة الأولى", n=42)

    # القيم غير الموحدة: كل حقل فيه أكثر من كتابة لنفس القيمة
    for (city, field), values in NORM.variants.items():
        for value, raws in values.items():
            if len(raws) > 1:
                variants = " | ".join(f"«{k}» ×{v}" for k, v in raws.most_common(6))
                Q.hit("nonstandard", city, None, None, field, variants, f"{field} ← «{value}»", n=len(raws) - 1)
    NORM.city = None

    issues = sorted(Q.issues.values(), key=lambda i: -(i["counts"][ADRA] + i["counts"][HASYA]))
    return {"generated": dt.datetime.now().isoformat(timespec="seconds"),
            "files": {ADRA: "ارشفة 05-10-2026.xlsx", HASYA: "Database - August 2026 (13).xlsx"},
            "issues": issues}


# ═════════════════════════ أرقام اللوحة العامة ═════════════════════════

def build_stats(a: Adra, h: Hasya) -> dict:
    adra_rows = a.fz_rows()
    adra_plots = set()
    for r in adra_rows:
        adra_plots.update(split_plots(a.fz.get(r, 3))[0])
    black_rows = [r for r in a.black.data_rows() if s(a.black.get(r, 1)) and "ليست الغاء" not in str(a.black.get(r, 11))]
    hrows = h.main_rows()
    km_rows = list(h.km.data_rows())
    overdue_land = sum(overdue_count(h.main.get(r, 101)) or 0 for r in hrows)
    overdue_diff = sum(overdue_count(h.main.get(r, 99)) or 0 for r in hrows)
    overdue = overdue_land + overdue_diff
    overdue_files = sum(1 for r in hrows if (overdue_count(h.main.get(r, 101)) or 0) + (overdue_count(h.main.get(r, 99)) or 0) > 0)
    overdue_scheduled = sum(1 for r in hrows if (overdue_count(h.main.get(r, 101)) or 0) > 0 and h.main.get(r, 57) is not None)

    def by(cat_rows, getter):
        c = collections.Counter()
        for r in cat_rows:
            v = getter(r)
            if v:
                c[v] += 1
        return c

    adra_cat = by(adra_rows, lambda r: norm_category(a.fz.get(r, 4))[0])
    hasya_cat = by(hrows, lambda r: norm_category(h.main.get(r, 12))[0])
    adra_year = by(adra_rows, lambda r: (to_date(a.fz.get(r, 10))[0] or "")[:4])
    hasya_year = by(hrows, lambda r: (to_date(h.main.get(r, 22))[0] or "")[:4])
    years = sorted(set(adra_year) | set(hasya_year))
    cats = sorted(set(adra_cat) | set(hasya_cat), key=lambda c: -(adra_cat[c] + hasya_cat[c]))
    return {
        "cities": {
            ADRA: {"plots": len(adra_plots), "plotsNote": "مشتق من شيت فرز — لا يوجد سجل كامل للمقاسم في عدرا",
                   "allocated": len(adra_rows), "cancelled": len(black_rows),
                   "adminLicenses": len(list(a.misc.data_rows(3))), "overdue": None,
                   "overdueNote": "لا توجد بيانات أقساط في ملف عدرا", "investors": len({norm_key(s(a.fz.get(r, 5)) or "") for r in adra_rows})},
            HASYA: {"plots": len(km_rows), "plotsNote": "من شيت كامل المقاسم",
                    "allocated": len(hrows), "cancelled": len(list(h.c25.data_rows())) + len(list(h.old.data_rows())),
                    "adminLicenses": sum(1 for r in hrows if s0(h.main.get(r, 37)) or s0(h.main.get(r, 38))),
                    "overdue": overdue, "overdueLand": overdue_land, "overdueDiff": overdue_diff,
                    "overdueFiles": overdue_files, "overdueScheduled": overdue_scheduled,
                    "overdueNote": f"من نص الحالة المالية في {overdue_files} إضبارة: {overdue_diff} فرق سعر + {overdue_land} أرض — "
                                   f"إضبارتان فقط لهما جدول أقساط بتواريخ",
                    "investors": len({norm_key(s(h.main.get(r, 5)) or "") for r in hrows})},
        },
        "byCategory": [{"name": c, ADRA: adra_cat[c], HASYA: hasya_cat[c]} for c in cats[:9]],
        "byYear": [{"year": y, ADRA: adra_year[y], HASYA: hasya_year[y]} for y in years if y and 1995 <= int(y) <= TODAY.year],
        "hasyaPlotStatus": dict(collections.Counter(s(h.km.get(r, 6)) for r in km_rows)),
    }



# ═════════════════════════ إحصائيات موسعة للوحة العامة ═════════════════════════

def top(counter, n=10, other=True):
    items = counter.most_common()
    out = [{"name": k, "value": v} for k, v in items[:n]]
    rest = sum(v for _, v in items[n:])
    if other and rest:
        out.append({"name": "أخرى", "value": rest})
    return out


AREA_BUCKETS = [(0, 600, "أقل من 600"), (600, 1200, "600–1,200"), (1200, 2400, "1,200–2,400"),
                (2400, 5000, "2,400–5,000"), (5000, 10000, "5,000–10,000"), (10000, 10 ** 9, "أكثر من 10,000")]


def bucket(area):
    for lo, hi, label in AREA_BUCKETS:
        if lo <= area < hi:
            return label
    return None


def year_of(v):
    d, _ = to_date(v)
    return d[:4] if d else None


def build_more_stats(a: "Adra", h: "Hasya") -> dict:
    C = collections.Counter
    out = {}

    # ── عدرا ──
    rows = a.fz_rows()
    g = a.fz.get
    areas = [num(g(r, 6))[0] for r in rows]
    areas = [x for x in areas if isinstance(x, (int, float)) and x > 0]
    names = {norm_key(s(g(r, 5)) or ""): s(g(r, 5)) for r in rows if s(g(r, 5))}
    inv_types, forms, cr = C(), C(), 0
    for raw in names.values():
        info = parse_investor(raw)
        inv_types[info["type"]] += 1
        if info["legal_form"]:
            forms[info["legal_form"]] += 1
        cr += bool(info["cr_no"])
    plot_counts = C()
    for r in rows:
        n = len(split_plots(g(r, 3))[0])
        if n:
            plot_counts["5 فأكثر" if n >= 5 else str(n)] += 1
    black = [r for r in a.black.data_rows() if s(a.black.get(r, 1)) and "ليست الغاء" not in str(a.black.get(r, 11))]
    reasons = C()
    for r in black:
        txt = s(a.black.get(r, 11)) or ""
        if "فصل" in txt:
            reasons["فصل من المدينة"] += 1
        elif "الإدارة" in txt or "الادارة" in txt:
            reasons["إلغاء من الإدارة"] += 1
        elif "تبديل" in " ".join(str(a.black.get(r, c) or "") for c in (11, 12, 13)):
            reasons["تبديل مقسم"] += 1
        elif "دمج" in str(a.black.get(r, 0)):
            reasons["دمج مقاسم"] += 1
        elif txt and txt not in ("د", "1"):
            reasons["أسباب أخرى"] += 1
        else:
            reasons["غير مذكور"] += 1
    sold = [r for r, sec in a.sold_section.items() if sec == "البيع"]
    inherit = [r for r, sec in a.sold_section.items() if sec == "انتقال"]
    sales_year = collections.defaultdict(C)
    for r in sold:
        y = year_of(a.sold.get(r, 10))
        if y:
            sales_year[y]["كامل" if s(a.sold.get(r, 11)) == "الكامل" else "حصة"] += 1
    misc = list(a.misc.data_rows(3))
    misc_dur = C("مؤقت" if "مؤقت" in str(a.misc.get(r, 16)) else ("دائم" if "دائم" in str(a.misc.get(r, 16)) else "غير محدد") for r in misc)
    misc_ind = C(s(a.misc.get(r, 11)) or "غير محدد" for r in misc)
    law = list(a.law18.data_rows(8))
    law_value = sum(num0(a.law18.get(r, 7))[0] or 0 for r in law)
    law_jobs = sum(num0(a.law18.get(r, 14))[0] or 0 for r in law)
    top_inv = C(s(g(r, 5)) for r in rows if s(g(r, 5)))
    out[ADRA] = {
        "totalArea": round(sum(areas)), "avgArea": round(sum(areas) / len(areas)) if areas else 0,
        "mergedAllocs": sum(1 for r in rows if "+" in str(g(r, 3))),
        "subPlots": sum(1 for r in rows if re.search(r"[\\/]", str(g(r, 3)))),
        "byGrade": top(C(norm_category(g(r, 4))[1] or "بدون درجة" for r in rows)),
        "bySector": top(C(norm_sector(g(r, 14)) or "غير محدد" for r in rows), 9),
        "byPhase": top(C(norm_phase(g(r, 13)) or "غير محدد" for r in rows), 6),
        "areaBuckets": [{"name": l, "value": sum(1 for x in areas if bucket(x) == l)} for _, _, l in AREA_BUCKETS],
        "plotsPerAlloc": [{"name": k, "value": plot_counts[k]} for k in ("1", "2", "3", "4", "5 فأكثر")],
        "investorTypes": top(inv_types), "legalForms": top(forms), "withCR": cr,
        "womenNames": sum(1 for x in names.values() if re.search(r"\bبنت\b|بنات", x)),
        "cancelReasons": top(reasons),
        "cancelByYear": dict(C(year_of(a.black.get(r, 10)) for r in black if year_of(a.black.get(r, 10)))),
        "salesTotal": len(sold), "inheritTransfers": len(inherit),
        "salesByYear": [{"year": y, "كامل": v["كامل"], "حصة": v["حصة"]} for y, v in sorted(sales_year.items())],
        "salesShare": top(C("كامل" if s(a.sold.get(r, 11)) == "الكامل" else ("حصة" if s(a.sold.get(r, 11)) else "غير محدد") for r in sold)),
        "adminDuration": top(misc_dur), "adminByIndustry": top(misc_ind, 7),
        "law18": {"projects": len(law), "value": law_value, "jobs": law_jobs},
        "subsCancelled": sum(1 for r in a.cancel_subs.data_rows(4) if s(a.cancel_subs.get(r, 4))),
        "foldRequests": len({str(a.fold.get(r, 0)) for r in a.fold.data_rows() if a.fold.get(r, 0) is not None}),
        "settled": sum(1 for r in rows if "تمت التسوية" in str(g(r, 18))),
        "decisions": len({s(g(r, 9)) for r in rows if s(g(r, 9))}),
        "topInvestors": [{"name": k, "value": v} for k, v in top_inv.most_common(8)],
    }

    # ── حسياء ──
    rows = h.main_rows()
    g = h.main.get
    areas = [num(g(r, 10))[0] for r in rows]
    areas = [x for x in areas if isinstance(x, (int, float)) and x > 0]
    names = {norm_key(s(g(r, 5)) or ""): (s(g(r, 5)), s0(g(r, 6))) for r in rows if s(g(r, 5))}
    inv_types, forms = C(), C()
    for raw, partners in names.values():
        info = parse_investor(raw, partners)
        inv_types[info["type"]] += 1
        if info["legal_form"]:
            forms[info["legal_form"]] += 1
    nat = C()
    for r in rows:
        for x in str(g(r, 7) or "").split("\n"):
            x = s(x)
            if x:
                nat["سوريا" if x in ("ع س", "سوري") else x] += 1
    ops = C()
    for r in rows:
        v = s(g(r, 36)) or "غير محدد"
        ops["ترخيص إداري مؤقت" if "مؤقت" in v else v] += 1
    km = list(h.km.data_rows())
    mods = C()
    for r in rows:
        m = s(g(r, 30))
        if not m:
            continue
        if "دمج" in m:
            mods["دمج"] += 1
        elif "شريك" in m:
            mods["تعديل شركاء"] += 1
        elif "ملكية" in m or "ورثة" in m or "ارث" in m:
            mods["نقل ملكية" + (" + صناعة" if "صناع" in m else "")] += 1
        elif "صناع" in m or "نشاط" in m:
            mods["إضافة/تعديل صناعة"] += 1
        elif "اسم" in m or "كنية" in m or "صفة" in m:
            mods["تعديل الاسم/الصفة"] += 1
        elif "مساحة" in m or "المقسم" in m:
            mods["تعديل المساحة/المقسم"] += 1
        else:
            mods["أخرى"] += 1
    tenants = [x for r in rows if s0(g(r, 105)) for x in str(g(r, 105)).split("\n") if x.strip()]
    leased = sum(num0(g(r, 108))[0] or 0 for r in rows)
    sums = lambda c: round(sum(num0(g(r, c))[0] or 0 for r in rows), 2)
    top_inv = C(s(g(r, 5)) for r in rows if s(g(r, 5)))
    cancel_year = C(year_of(h.c25.get(r, 0)) for r in h.c25.data_rows() if year_of(h.c25.get(r, 0)))
    contracts_v = [num0(g(r, 27))[0] for r in rows if s0(g(r, 25))]
    out[HASYA] = {
        "totalArea": round(sum(areas)), "avgArea": round(sum(areas) / len(areas)) if areas else 0,
        "mergedAllocs": sum(1 for r in rows if "+" in str(g(r, 2))),
        "subPlots": sum(1 for r in rows if "/" in str(g(r, 2))),
        "byGrade": top(C(s(g(r, 15)) or "غير محدد" for r in rows)),
        "bySector": top(C(norm_sector(g(r, 3)) or "غير محدد" for r in rows), 9),
        "byPhase": top(C(norm_phase(g(r, 11)) or "غير محدد" for r in rows), 6),
        "byPlotClass": top(C(norm_plot_class(g(r, 4)) or "غير محدد" for r in rows)),
        "byIndustryType": top(C(s(g(r, 14)) or "غير محدد" for r in rows), 10),
        "byLegal": top(C(norm_legal(g(r, 18)) or "غير محدد" for r in rows), 6),
        "areaBuckets": [{"name": l, "value": sum(1 for x in areas if bucket(x) == l)} for _, _, l in AREA_BUCKETS],
        "investorTypes": top(inv_types), "legalForms": top(forms),
        "nationalities": top(nat, 8), "women": sum(1 for r in rows if s0(g(r, 9))),
        "foreign": sum(1 for r in rows if s(g(r, 7)) and s(g(r, 7)) not in ("سوريا", "ع س")),
        "operational": top(ops, 7),
        "buildingStatus": top(C(s(g(r, 35)) or "غير محدد" for r in rows)),
        "adminDuration": top(C({"نهائي": "دائم"}.get(s(g(r, 39)), "مؤقت" if "مؤقت" in str(g(r, 39)) else s(g(r, 39))) for r in rows if s(g(r, 39)))),
        "adminScope": top(C(s(g(r, 41)) for r in rows if s(g(r, 41)))),
        "issuers": top(C(norm_issuer(g(r, 19)) for r in rows if s(g(r, 19))), 6),
        "landStatus": top(C(s(g(r, 101)) for r in rows if s(g(r, 101))), 8, other=False),
        "diffStatus": top(C(s(g(r, 99)) for r in rows if s(g(r, 99))), 8, other=False),
        "plotStatus": top(C(s(h.km.get(r, 6)) for r in km if s(h.km.get(r, 6)))),
        "plotService": top(C(s(h.km.get(r, 8)) for r in km if s(h.km.get(r, 8)))),
        "plotVoltage": top(C(s(h.km.get(r, 9)) for r in km if s(h.km.get(r, 9)))),
        "plotClassAll": top(C(norm_plot_class(h.km.get(r, 5)) for r in km if s(h.km.get(r, 5)))),
        "modifications": top(mods), "modsTotal": sum(mods.values()),
        "tenants": len(tenants), "leasedArea": round(leased), "leaseContracts": sum(1 for r in rows if s0(g(r, 106))),
        "capital": sums(48), "capitalUSD": sums(49), "workers": sums(52), "kva": sums(50), "water": sums(51), "machines": sums(54),
        "contracts": len(contracts_v), "contractsValue": round(sum(x or 0 for x in contracts_v)),
        "industrialLicenses": sum(1 for r in rows if s0(g(r, 16))),
        "buildingLicenses": sum(1 for r in rows if s0(g(r, 32))),
        "schedules": sum(1 for r in rows if g(r, 57) is not None),
        "cancelByYear": dict(cancel_year),
        "topInvestors": [{"name": k, "value": v} for k, v in top_inv.most_common(8)],
    }
    return out


# ═════════════════════════ التشغيل ═════════════════════════

def main():
    print("قراءة ملف عدرا (فك الحماية)…")
    a = Adra(load_adra())
    print("قراءة ملف حسياء…")
    h = Hasya(load_hasya())

    # الجودة أولاً على كامل الملفات (قبل العينة حتى لا تختلط عدادات التطبيع)
    print("حساب تقرير الجودة على كامل الملفات…")
    quality = build_quality(a, h)
    stats = build_stats(a, h)
    stats["more"] = build_more_stats(a, h)
    NORM.variants.clear()

    print("اختيار العينة وتحويلها…")
    sa = adra_sample(a)
    for r in sa["fz"]:
        a.build_fz(r)
    for r in sa["black"]:
        a.build_black(r)
    for r in sa["fold"]:
        a.build_fold(r)
    for r in sa["merge"]:
        a.build_merge(r)
    sh = hasya_sample(h)
    for r in sh["main"]:
        h.build(h.main, r, Hasya.MAIN, cancelled=False)
    for r in sh["c25"]:
        h.build(h.c25, r, Hasya.CANCELLED, cancelled=True)
    for r in sh["old"]:
        h.build_old(r)
    # مقاسم غير مخصصة من سجل حسياء الكامل (لإظهار أن الحالة تُحسب)
    free = [r for r in h.km.data_rows() if s(h.km.get(r, 6)) == "غير مخصص"]
    random.shuffle(free)
    for r in free[:25]:
        for p in split_plots(h.km.get(r, 1))[0]:
            add_plot(HASYA, p, h.km.get(r, 1), **{k: v for k, v in h.plot_lookup(p).items() if v is not None})

    # ربط الشاري/البائع بعقود حسياء بالرمز، وتحديث أسماء المستثمرين للعرض
    lists_data = {
        "nationality": sorted({p["الجنسية"] for p in DB["partners"] if p["الجنسية"]}),
        "industry_type": sorted({x["نوع الصناعة"] for x in DB["allocations"] if x["نوع الصناعة"]}),
        "admin_category": sorted({x["الفئة"] for x in DB["admin_licenses"] if x["الفئة"]}),
        "payment_system": sorted({x["نظام الدفع"] for x in DB["financial"] if x["نظام الدفع"]}),
        "land_inst_status": sorted({x["حالة أقساط الأرض"] for x in DB["financial"] if x["حالة أقساط الأرض"]}),
        "price_diff_status": sorted({x["حالة فرق السعر"] for x in DB["financial"] if x["حالة فرق السعر"]}),
        "sectors": {c: sorted({p["المنطقة / القطاع"] for p in DB["plots"] if p["المدينة"] == c and p["المنطقة / القطاع"]}) for c in (ADRA, HASYA)},
        "phases": {c: sorted({p["المرحلة الجغرافية"] for p in DB["plots"] if p["المدينة"] == c and p["المرحلة الجغرافية"]}) for c in (ADRA, HASYA)},
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dump = lambda name, obj: (OUT_DIR / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    dump("db.json", DB)
    dump("raw_rows.json", RAW)
    dump("quality_report.json", quality)
    dump("stats.json", stats)
    dump("lists_data.json", lists_data)

    print("\nالنتيجة:")
    for t in SCHEMA["tables"]:
        print(f"  {t['num']:>2}. {t['name']:<28} {len(DB[t['id']]):>5} سطر")
    by_city = collections.Counter(x["المدينة"] for x in DB["allocations"])
    print(f"  التخصيصات حسب المدينة: {dict(by_city)}")
    print(f"  سجلات معلّمة needs_review: {sum(1 for t in DB.values() for x in t if x['_review'])}")
    print("  تقرير الجودة:")
    for i in quality["issues"]:
        print(f"    - {i['title']}: عدرا {i['counts'][ADRA]} / حسياء {i['counts'][HASYA]}")


if __name__ == "__main__":
    main()

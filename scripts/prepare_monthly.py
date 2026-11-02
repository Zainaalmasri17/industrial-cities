"""
تحويل قوالب الوزارة الشهرية (الإصدار 1.2) المستلمة من المدن الخمس إلى src/data/monthly.json

لكل مدينة مجلد فيه أربعة ملفات: المقاسم، الاستثمارات، الإنتاجية، الإنجازات والتحديات.
السكربت لا يصحح البيانات ولا يخمّن: يقرأها كما هي، يحسب المؤشرات، ويسجّل كل مشكلة
مع رقم السطر والعمود والقيمة كما وردت.

    python scripts/prepare_monthly.py
"""
from __future__ import annotations

import datetime as dt
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'data', 'monthly.json')

MONTH = '2026-10'
REPORT_END = dt.date(2026, 10, 31)

# مجلد المدينة ← اسمها كما في قائمة (المدن) في القوالب
CITY_DIRS = {
    '3dra': 'عدرا',
    'hethia': 'حسياء',
    'elsheik najar': 'الشيخ نجار',
    'bab alhwa': 'باب الهوى',
    'alra3e': 'الراعي',
}
CITY_ORDER = ['عدرا', 'حسياء', 'الشيخ نجار', 'باب الهوى', 'الراعي']

TEMPLATES = {
    'plots': {'title': 'المقاسم', 'sheet': 'المقاسم', 'file_word': 'المقاسم'},
    'invest': {'title': 'الخطة الاستثمارية', 'sheet': 'الخطة الاستثمارية', 'file_word': 'الاستثمارات'},
    'prod': {'title': 'الإنتاجية', 'sheet': 'الإنتاجية', 'file_word': 'الإنتاجية'},
    'ach': {'title': 'الإنجازات والتحديات', 'sheet': 'الإنجازات والتحديات', 'file_word': 'الإنجازات_والتحديات'},
}

# ───────────────────────── أدوات عامة ─────────────────────────

PLACEHOLDERS = {'ــ', 'ـــ', 'ـ', 'ـــــ', '-', '--', '_', '__', '*', '.', '؟', '?'}
DASHES_RE = re.compile(r'^[\s\-ـ_]*$')


def col_letter(i: int) -> str:
    s = ''
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def norm_header(h):
    if h is None:
        return None
    h = re.sub(r'\s+', ' ', str(h)).strip()
    # حسياء استبدلت كلمة (الصناعي) بـ(المنشآت صناعية) في عناوين الأعمدة
    h = h.replace('المنشآت صناعية', 'الصناعي')
    return h


def show(v) -> str:
    if v is None:
        return ''
    if isinstance(v, dt.datetime):
        return v.date().isoformat() if v.time() == dt.time(0) else v.isoformat(sep=' ')
    if isinstance(v, (dt.date, dt.time)):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def is_blank(v) -> bool:
    return v is None or (isinstance(v, str) and v.strip() == '')


def is_placeholder(v) -> bool:
    """قيمة تملأ الخانة ولا تحمل معلومة: ــ، -، _، *، ' - - - '"""
    if not isinstance(v, str):
        return False
    s = v.strip()
    if s == '':
        return False
    return s in PLACEHOLDERS or bool(DASHES_RE.match(s))


def txt(v):
    """نص منظف للعرض والتجميع (بدون تعديل المعنى)"""
    if is_blank(v) or is_placeholder(v):
        return None
    if isinstance(v, str):
        return re.sub(r'\s+', ' ', v).strip()
    return show(v)


def num(v):
    """(القيمة الرقمية، هل كانت نصاً)"""
    if v is None or isinstance(v, bool):
        return None, False
    if isinstance(v, (int, float)):
        return float(v), False
    s = str(v).strip().replace(',', '').replace('٬', '')
    s = s.translate(str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789'))
    try:
        return float(s), True
    except ValueError:
        return None, True


DATE_TXT = [
    (re.compile(r'^(\d{4})-(\d{1,2})-(\d{1,2})$'), 'ymd'),
    (re.compile(r'^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$'), 'dmy'),
]


def date_of(v):
    """(تاريخ أو None، نوع المشكلة أو None)"""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None, None
    if isinstance(v, dt.datetime):
        if v.year < 1950:
            return None, 'zero'
        return v.date(), None
    if isinstance(v, dt.date):
        return v, None
    if isinstance(v, dt.time):
        return None, 'zero'
    if isinstance(v, (int, float)):
        return None, 'number'
    s = str(v).strip()
    if is_placeholder(s):
        return None, 'placeholder'
    for rx, kind in DATE_TXT:
        m = rx.match(s)
        if m:
            a, b, c = map(int, m.groups())
            try:
                d = dt.date(a, b, c) if kind == 'ymd' else dt.date(c, b, a)
                return d, 'text'
            except ValueError:
                return None, 'invalid'
    return None, 'invalid'


# ───────────────────────── سجل المشاكل ─────────────────────────

ISSUE_DEFS: dict[str, dict] = {}


def defissue(id, title, desc, severity, fix, template):
    ISSUE_DEFS[id] = dict(id=id, title=title, desc=desc, severity=severity, fix=fix, template=template)


# الملفات وهيكل القالب
defissue('file_name', 'اسم الملف مخالف للقاعدة', 'القاعدة: اسم المدينة ثم اسم القالب ثم الشهر، مثل عدرا_المقاسم_2026-10.xlsx', 'منخفض', 'إعادة تسمية الملف قبل الإرسال', 'عام')
defissue('example_row', 'سطر المثال الرمادي لم يُحذف', 'سطر المثال التوضيحي من القالب ما زال موجوداً، ويدخل في الأرقام إن لم يُستبعد. استبعدناه من كل الحسابات.', 'مرتفع', 'حذف السطر 2 من كل شيت قبل الإرسال', 'عام')
defissue('header_changed', 'تغيير أسماء الأعمدة أو إضافة أعمدة', 'القاعدة 6: لا تُضاف أعمدة ولا تُغيَّر أسماء الأعمدة. التغيير يكسر الربط الآلي بين الملفات.', 'مرتفع', 'العودة للقالب الأصلي ونقل القيم بـ (لصق القيم فقط)', 'عام')
defissue('old_template', 'نسخة قالب مختلفة', 'الشيت مبني على نسخة أقدم من القالب: فيه أعمدة غير موجودة في الإصدار 1.2 وتنقصه أعمدة منه.', 'مرتفع', 'استخدام الإصدار 1.2 من القالب', 'عام')
defissue('empty_rows', 'سطور شبه فارغة', 'سطور فيها اسم المدينة فقط أو قيمة واحدة بلا بيانات فعلية.', 'متوسط', 'حذف السطور الفارغة أو إكمالها', 'عام')

# المقاسم
defissue('required_missing', 'حقل إلزامي فارغ', 'حقل إلزامي (أو إلزامي عند تحقق شرطه) تُرك فارغاً دون ذكر السبب في عمود الملاحظات.', 'مرتفع', 'تعبئة الحقل أو ذكر سبب النقص في (ملاحظات)', 'المقاسم')
defissue('placeholder', 'رموز بدل القيمة (ــ، -، _، *)', 'خانات مملوءة بشرطة أو رمز بدل القيمة أو بدل (لا يوجد). لا يمكن التمييز بين (غير موجود) و(غير معروف).', 'متوسط', 'كتابة (لا يوجد) أو ترك الخانة فارغة مع ملاحظة', 'المقاسم')
defissue('not_in_list', 'قيمة من خارج القائمة المنسدلة', 'القاعدة 3: الأعمدة ذات القوائم تُختار من القائمة فقط. القيم المكتوبة يدوياً لا تُجمع مع غيرها.', 'مرتفع', 'الاختيار من القائمة، ولطلب قيمة جديدة التواصل مع الوزارة', 'المقاسم')
defissue('extra_spaces', 'مسافات زائدة داخل القيمة', 'قيم من القائمة لكن بمسافة قبلها أو بعدها (مثل « مواد بناء »)، فتُحسب كقيمة مختلفة.', 'منخفض', 'الاختيار من القائمة بدل الكتابة', 'المقاسم')
defissue('dup_key', 'مقسم مكرر (نفس المدينة + القطاع + الرقم)', 'المفتاح يجب أن يكون فريداً. التكرار يعني مقسماً مسجلاً مرتين أو رقماً خاطئاً.', 'مرتفع', 'توحيد السطرين أو تصحيح الرقم', 'المقاسم')
defissue('plot_no_format', 'رقم مقسم بصيغة غير موحدة', 'رقم المقسم فيه \\ بدل / أو أكثر من مقسم في خانة واحدة (+). القاعدة 2: مقسم واحد في كل سطر.', 'متوسط', 'رقم واحد بصيغة المخطط (مثل 16/7)', 'المقاسم')
defissue('date_text', 'تاريخ مكتوب كنص', 'القاعدة 5: التواريخ بصيغة yyyy-mm-dd كتاريخ فعلي، لا كنص.', 'متوسط', 'إدخال التاريخ كتاريخ', 'المقاسم')
defissue('date_invalid', 'تاريخ غير صالح', 'قيمة في عمود تاريخ لا يمكن قراءتها كتاريخ (رمز، رقم، تاريخ صفري، تاريخان في خانة).', 'مرتفع', 'تصحيح التاريخ', 'المقاسم')
defissue('date_future', 'تاريخ بعد نهاية الشهر', 'تاريخ قرار أو ترخيص أو عقد بعد 2026-10-31، أي في المستقبل بالنسبة لتقرير شهر 10.', 'متوسط', 'التحقق من السنة والشهر', 'المقاسم')
defissue('number_text', 'رقم مكتوب كنص أو مع وحدة', 'القاعدة 5: الأرقام بدون وحدات أو نصوص.', 'متوسط', 'إدخال الرقم فقط', 'المقاسم')
defissue('merge_inconsistent', 'بيانات الدمج متناقضة', 'اختير (نعم) للدمج دون ذكر المقاسم المدموجة، أو ذُكرت مقاسم مع (لا)، أو كُتب (لا) في خانة أرقام المقاسم.', 'متوسط', 'مطابقة عمودي الدمج', 'المقاسم')
defissue('merge_format', 'المقاسم المدموجة بصيغ مختلفة', 'أرقام المقاسم المدموجة مكتوبة بفواصل مختلفة (+، -، فاصلة، مسافة، «من… حتى…»).', 'منخفض', 'صيغة موحدة', 'المقاسم')
defissue('phase_investor', 'المرحلة لا تطابق وجود مستثمر', 'مقسم مرحلته (مخصص) بلا اسم مستثمر، أو مقسم (غير مخصص / معروض) وعليه اسم مستثمر.', 'مرتفع', 'تصحيح المرحلة أو اسم المستثمر', 'المقاسم')
defissue('investor_suspicious', 'اسم مستثمر غير صالح', 'اسم المستثمر رقم أو كلمة عامة (مثل «مفصول»، «اكتتاب 3»، «بقعه استثمارية») لا اسم جهة.', 'متوسط', 'كتابة اسم المستثمر الفعلي أو تصحيح المرحلة', 'المقاسم')
defissue('name_has_notes', 'ملاحظات داخل خانة اسم المستثمر', 'خانة الاسم فيها حالة أو تاريخ أو رقم قرار بين قوسين، مثل «(مفصول (16) 23/7/2017)» أو «(منسحب بالطلب…)».', 'متوسط', 'الاسم فقط في خانته، والفصل يُسجل في (التخصيصات السابقة)', 'المقاسم')
defissue('lease_inconsistent', 'بيانات الإيجار متناقضة', 'المقسم (مؤجر = نعم) بلا اسم مستأجر، أو العكس.', 'متوسط', 'مطابقة عمودي الإيجار', 'المقاسم')
defissue('multi_value', 'أكثر من قيمة في خانة واحدة', 'قيمتان أو أكثر في خانة واحدة (سطر جديد داخل الخلية)، مثل رقمي ترخيص وتاريخين.', 'متوسط', 'سطر لكل قيمة', 'المقاسم')
defissue('notes_missing_info', 'ملاحظة: المعلومات غير متوفرة', 'عمود الملاحظات يقول إن المعلومات لم يُعثر عليها. ليست خطأ تعبئة لكنها نقص فعلي في البيانات.', 'منخفض', 'استكمال البيانات من الأرشيف', 'المقاسم')
defissue('nationality_country', 'الدولة لا تطابق الجنسية', 'عمود (الدولة) للأجنبي فقط، لكنه معبأ «سوريا» للسوريين، أو فارغ للأجنبي.', 'منخفض', 'ترك الدولة فارغة للسوري', 'المقاسم')
defissue('area_missing', 'مساحة فارغة أو صفر', 'المساحة إلزامية لكل مقسم.', 'مرتفع', 'إدخال المساحة من المخطط', 'المقاسم')

# الأقساط والتخصيصات السابقة
defissue('inst_count', 'عدد الأقساط لا يطابق المسجل', 'عدد الأقساط في شيت المقاسم لا يساوي عدد السطور في شيت الأقساط لنفس المقسم.', 'مرتفع', 'إضافة الأقساط الناقصة أو تصحيح العدد', 'الأقساط')
defissue('inst_value', 'قيمة قسط فارغة أو صفر', 'قسط بلا قيمة أو بقيمة 0.', 'متوسط', 'إدخال قيمة القسط', 'الأقساط')
defissue('inst_due', 'قسط بلا تاريخ استحقاق', 'لا يمكن معرفة التأخر بدون تاريخ الاستحقاق.', 'مرتفع', 'إدخال تاريخ الاستحقاق', 'الأقساط')
defissue('inst_receipt', 'قسط مدفوع بلا إيصال', 'القسط مدفوع (نعم) دون رقم إيصال أو تاريخه.', 'متوسط', 'إدخال رقم الإيصال وتاريخه', 'الأقساط')
defissue('inst_receipt_dup', 'رقم إيصال مكرر', 'القاعدة 12: رقم الإيصال مع تاريخه لا يتكرر أبداً.', 'مرتفع', 'التحقق من الإيصال', 'الأقساط')
defissue('inst_orphan', 'قسط لمقسم غير موجود', 'سطر في شيت الأقساط لا يقابله مقسم في شيت المقاسم.', 'مرتفع', 'اختيار المقسم من القائمة', 'الأقساط')
defissue('prev_missing', 'تخصيص سابق بلا سجل', 'اختير (نعم) في (هل خُصص المقسم لمستثمر سابقاً؟) دون سطر في شيت التخصيصات السابقة.', 'متوسط', 'إضافة المستثمر السابق', 'الأقساط')
defissue('prev_cancel_date', 'تخصيص سابق بلا تاريخ إلغاء', 'المستثمر السابق مسجل دون تاريخ إلغاء التخصيص.', 'متوسط', 'إدخال تاريخ الإلغاء', 'الأقساط')

# الخطة الاستثمارية
defissue('pct_fraction', 'النسب مكتوبة ككسور', 'نسب التنفيذ مكتوبة 0.25 و1 بدل 25 و100، فتظهر كأنها أقل من 1%.', 'مرتفع', 'كتابة النسبة من 100', 'الخطة الاستثمارية')
defissue('pct_range', 'نسبة خارج المدى', 'نسبة تنفيذ أكبر من 100 أو سالبة.', 'مرتفع', 'تصحيح النسبة', 'الخطة الاستثمارية')
defissue('spent_gt', 'المنفق أكبر من قيمة العقد', 'المبلغ المنفق حتى تاريخه يتجاوز قيمة العقد.', 'متوسط', 'التحقق من المبلغين', 'الخطة الاستثمارية')
defissue('status_dates', 'حالة المشروع لا تطابق التواريخ', 'القاعدة 6: التعاقد دائماً، المباشرة لما بعد التعاقد، التوقف وسببه للمتوقف، الانتهاء للمنتهي.', 'متوسط', 'تعبئة التواريخ حسب الحالة', 'الخطة الاستثمارية')
defissue('status_missing', 'حالة المشروع فارغة', 'لا يمكن معرفة وضع المشروع.', 'مرتفع', 'اختيار الحالة من القائمة', 'الخطة الاستثمارية')
defissue('stop_reason_in_exec', 'سبب التوقف في عمود الجهة المنفذة', 'نص مثل «سياسة التقشف» أو «دراسة فنية» مكتوب في عمود (الجهة المنفذة)، والسبب الحقيقي في الملاحظات.', 'متوسط', 'نقل السبب لعمود (سبب التوقف)', 'الخطة الاستثمارية')

# الإنتاجية
defissue('prod_month', 'الشهر غير صحيح', 'القاعدة 5: الشهر يُكتب كأول يوم منه (2026-10-01).', 'مرتفع', 'كتابة 2026-10-01', 'الإنتاجية')
defissue('prod_calc', 'العجز أو الفائض لا يطابق الحساب', 'العمود التلقائي (العجز أو الفائض) لا يساوي الاستطاعة المتاحة ناقص الاستهلاك.', 'متوسط', 'عدم الكتابة فوق العمود التلقائي', 'الإنتاجية')
defissue('prod_zero_unknown', 'الصفر يعني «غير متوفر»', 'المدينة كتبت 0 للقيم غير المعروفة، فلا يمكن التمييز بين صفر حقيقي ونقص بيانات.', 'متوسط', 'ترك الخانة فارغة وذكر السبب في الملاحظات', 'الإنتاجية')
defissue('prod_logic', 'قيم غير منطقية', 'مثل الاستطاعة المتاحة أكبر من إجمالي الاستطاعة، أو الاستهلاك أكبر من المتاح دون عجز.', 'متوسط', 'مراجعة القيم', 'الإنتاجية')

# الإنجازات والتحديات
defissue('ach_month', 'شهر غير شهر التقرير', 'بنود مؤرخة بشهر غير تشرين الأول 2026.', 'متوسط', 'كتابة 2026-10-01', 'الإنجازات والتحديات')
defissue('ach_empty', 'بند بلا وصف أو نوع', 'سطر فيه نوع البند دون وصفه أو العكس.', 'متوسط', 'إكمال السطر أو حذفه', 'الإنجازات والتحديات')
defissue('ach_city', 'مدينة أخرى داخل ملف المدينة', 'بند باسم مدينة أخرى (غالباً سطر المثال).', 'مرتفع', 'حذف السطر', 'الإنجازات والتحديات')


class Issues:
    def __init__(self):
        self.counts = defaultdict(Counter)  # id -> city -> n
        self.examples = defaultdict(list)  # id -> [ex]
        self.per_city_examples = defaultdict(Counter)

    def add(self, id, city, sheet=None, row=None, col=None, value=None, note=None, n=1):
        assert id in ISSUE_DEFS, id
        self.counts[id][city] += n
        if self.per_city_examples[id][city] < 8:
            self.per_city_examples[id][city] += 1
            self.examples[id].append(dict(city=city, sheet=sheet, row=row, col=col,
                                          value=(show(value)[:160] if value is not None else None), note=note))

    def dump(self):
        out = []
        for id, d in ISSUE_DEFS.items():
            if id not in self.counts:
                continue
            out.append(dict(d, counts={c: self.counts[id].get(c, 0) for c in CITY_ORDER}, examples=self.examples[id]))
        return out


ISS = Issues()

# ───────────────────────── قراءة الملفات ─────────────────────────


def read_sheet(ws):
    """[(رقم السطر في الإكسل، [القيم])] مع التوقف بعد 200 سطر فارغ متتالي"""
    rows, empty = [], 0
    for i, r in enumerate(ws.iter_rows(values_only=True, max_col=80), 1):
        if any(not is_blank(c) for c in r):
            empty = 0
            rows.append((i, list(r)))
        else:
            empty += 1
            if empty > 200:
                break
    return rows


class Sheet:
    def __init__(self, city, file, title, rows):
        self.city, self.file, self.title = city, file, title
        hdr = rows[0][1] if rows else []
        self.raw_headers = [h for h in hdr]
        self.headers = [norm_header(h) for h in hdr]
        while self.headers and self.headers[-1] is None:
            self.headers.pop()
        self.idx = {h: i for i, h in enumerate(self.headers) if h}
        self.rows = rows[1:]

    def get(self, r, name):
        i = self.idx.get(name)
        if i is None or i >= len(r):
            return None
        return r[i]

    def col(self, name):
        i = self.idx.get(name)
        return col_letter(i) if i is not None else None


def load_city(folder):
    files = {}
    for f in sorted(glob.glob(os.path.join(ROOT, folder, '*.xlsx'))):
        base = os.path.basename(f)
        if base.startswith('~$'):
            continue
        wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
        names = wb.sheetnames
        kind = None
        for k, t in TEMPLATES.items():
            if t['sheet'] in names:
                kind = k
        if kind is None:
            print('  ? ملف غير معروف:', base)
            continue
        # أكثر من ملف لنفس القالب (نسخة مصححة): يُعتمد الأحدث تعديلاً
        mtime = os.path.getmtime(f)
        if kind in files and files[kind]['mtime'] >= mtime:
            print(f'  ↷ تجاهل نسخة أقدم: {base}')
            wb.close()
            continue
        if kind in files:
            print(f"  ↷ تجاهل نسخة أقدم: {files[kind]['name']}")
        sheets = {n: read_sheet(wb[n]) for n in names if n not in ('تعليمات',)}
        files[kind] = dict(path=f'{folder}/{base}', name=base, sheets=sheets, size=os.path.getsize(f), mtime=mtime)
        wb.close()
    return files


# القيم الحرفية لأسطر المثال في القالب
EXAMPLE_MARKERS = [
    'عدرا | قطاع 1 | 16/7',
    'تعبيد طرق القطاع السابع',
    'ما زالت أرض المدينة مسجلة باسم وزارة الزراعة، مما يعيق إصدار رخص البناء للمستثمرين.',
]


def is_example(row_vals, city):
    vals = [show(v).strip() for v in row_vals if not is_blank(v)]
    for m in EXAMPLE_MARKERS:
        if m in vals:
            # نص مثال الإنجازات يخص باب الهوى: في ملف باب الهوى قد يكون بنداً حقيقياً
            if m.startswith('ما زالت') and city == 'باب الهوى':
                return 'maybe'
            return True
    return False


def check_filename(city, kind, name):
    expected = f"{city.replace(' ', '_')}_{TEMPLATES[kind]['file_word']}_{MONTH}.xlsx"
    stem = re.sub(r'\s*-\s*[^-]+\.xlsx$', '.xlsx', name)  # اللاحقة « - اسم المرسل» يضيفها التحميل
    stem = re.sub(r'\s*\(\d+\)', '', stem)
    stem = re.sub(r'_v\d+(?=\.xlsx$)', '', stem)
    stem = stem.translate(str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789'))
    if stem.replace(' ', '_') != expected:
        ISS.add('file_name', city, sheet=TEMPLATES[kind]['title'], value=name, note=f'المتوقع: {expected}')
    return expected


def check_lists_map(lists_rows):
    hdr = lists_rows[0][1]
    out = {}
    for j, h in enumerate(hdr):
        if not h or str(h).startswith('مساعد'):
            continue
        out[str(h)] = [str(r[1][j]).strip() for r in lists_rows[1:] if j < len(r[1]) and not is_blank(r[1][j])]
    return out


# ───────────────────────── المقاسم ─────────────────────────

PLOT_LIST_COLS = {
    'تصنيف المقسم': 'تصنيف_المقسم', 'نوع الاستعمال الخاص': 'الاستعمالات_الخاصة', 'نوع المبنى الخدمي العام': 'الأبنية_الخدمية_العامة',
    'فئة الصناعة': 'فئة_الصناعة', 'مرحلة المقسم': 'المرحلة', 'حالة التخديم': 'التخديم', 'نوع المستثمر': 'نوع_المستثمر',
    'الجنسية': 'الجنسية', 'هل المقسم مدموج مع مقاسم أخرى؟': 'نعم_لا', 'هل خُصص المقسم لمستثمر سابقاً؟': 'نعم_لا',
    'نمط الاستثمار': 'نمط_الاستثمار', 'نوع الترخيص الإداري': 'الترخيص_الإداري', 'حاصل على بيان ملكية؟': 'نعم_لا',
    'العملة': 'العملة', 'طريقة الدفع': 'طريقة_الدفع', 'نظام الاستثمار': 'نظام_الاستثمار', 'دورية الأقساط': 'دورية_الأقساط',
    'تمت التسوية؟': 'نعم_لا', 'هل المقسم مؤجر؟': 'نعم_لا',
}
PLOT_DATE_COLS = ['تاريخ طلب الاكتتاب', 'تاريخ قرار الترخيص الصناعي', 'تاريخ قرار التخصيص', 'تاريخ عقد البيع', 'تاريخ رخصة البناء',
                  'تاريخ الترخيص الإداري', 'تاريخ السجل الصناعي', 'تاريخ إيصال دفع قيمة المقسم', 'تاريخ إيصال الدفعة الأولى',
                  'تاريخ قرار الترخيص الصناعي للمستأجر', 'تاريخ السجل الصناعي للمستأجر']
PLOT_NUM_COLS = ['المساحة م²', 'سعر المتر عند التعاقد', 'قيمة المقسم المعتمدة بعد عوامل التثقيل', 'الرسوم',
                 'قيمة المقسم تقسيطاً بعد عوامل التثقيل', 'نسبة الدفعة الأولى %', 'عدد الأقساط']
# أعمدة الإكمال المعروضة في خريطة الاكتمال
COMPLETENESS_COLS = ['القطاع', 'رقم المقسم', 'المساحة م²', 'تصنيف المقسم', 'فئة الصناعة', 'اسم النشاط الصناعي', 'مرحلة المقسم',
                     'حالة التخديم', 'نوع المستثمر', 'اسم المستثمر الحالي', 'رقم السجل التجاري', 'الجنسية', 'الهاتف',
                     'رقم قرار التخصيص', 'تاريخ قرار التخصيص', 'رقم قرار الترخيص الصناعي', 'رقم رخصة البناء', 'رقم الترخيص الإداري',
                     'رقم السجل الصناعي', 'نمط الاستثمار', 'سعر المتر عند التعاقد', 'العملة', 'طريقة الدفع', 'عدد الأقساط']

PHASE_BUCKET = {
    'معروض للاستثمار': 'شاغر', 'غير مخصص': 'شاغر', 'جاهز ولكن غير معلن عنه': 'شاغر', 'غير جاهز وغير معلن عنه': 'شاغر',
    'مكتتب عليه': 'مكتتب عليه',
    'مخصص': 'مخصص', 'مخصص وحاصل على ترخيص بناء': 'مخصص', 'مخصص وحاصل على ترخيص إداري': 'مخصص',
    'مباشر بناء': 'مخصص', 'غير مباشر بناء': 'مخصص', 'مشغل دون ترخيص': 'مخصص',
}
NAME_NOTES = re.compile(r'\((?:[^)]*)(مفصول|منسحب|ملغى|ملغي|متوفى|قرار|\d{4})')
SUSPICIOUS_INVESTOR = re.compile(r'^(مفصول|اكتتاب\s*\d*|بقع[هة] استثماري[هة]|مركز تحويلي|المدينة الصناعية|لا يوجد|[\d.\s/]+)$')


def plot_key(city, sector, no):
    return f"{city} | {txt(sector) or ''} | {show(no).strip()}"


def process_plots(city, f, lists):
    sh = Sheet(city, f['name'], 'المقاسم', f['sheets']['المقاسم'])
    T = 'المقاسم'
    # تغيّر العناوين
    canon = REF_HEADERS['المقاسم']
    raw_norm = [re.sub(r'\s+', ' ', str(h)).strip() if h else None for h in sh.raw_headers]
    while raw_norm and raw_norm[-1] is None:
        raw_norm.pop()
    if raw_norm != canon:
        extra = [h for h in raw_norm if h and h not in canon]
        missing = [h for h in canon if h not in raw_norm]
        for h in extra:
            ISS.add('header_changed', city, sheet=T, row=1, col=col_letter(raw_norm.index(h)), value=h,
                    note='عمود مضاف' if norm_header(h) not in canon else f'العنوان الأصلي: {norm_header(h)}')
        for h in missing:
            if norm_header(h) not in [norm_header(x) for x in raw_norm]:
                ISS.add('header_changed', city, sheet=T, row=1, value=h, note='عمود محذوف')

    plots, reasons_by_row = [], {}
    keys = Counter()
    empty_rows = 0
    for rn, r in sh.rows:
        ex = is_example(r, city)
        if ex is True:
            ISS.add('example_row', city, sheet=T, row=rn, value=' | '.join(show(v) for v in r[:4] if not is_blank(v)))
            continue
        filled = [v for v in r if not is_blank(v)]
        g = lambda n: sh.get(r, n)
        if len(filled) <= 2 and is_blank(g('رقم المقسم')):
            empty_rows += 1
            if empty_rows <= 8:
                ISS.add('empty_rows', city, sheet=T, row=rn, value=' | '.join(show(v) for v in filled))
            else:
                ISS.counts['empty_rows'][city] += 1
            continue
        why = []

        def flag(id, col, value=None, note=None):
            ISS.add(id, city, sheet=T, row=rn, col=sh.col(col) if col else None, value=value, note=(f'{col}: {note}' if note and col else note or col))
            why.append(f"{ISSUE_DEFS[id]['title']}{' — ' + col if col else ''}{(': ' + show(value)[:60]) if value not in (None, '') else ''}")

        sector, no = g('القطاع'), g('رقم المقسم')
        key = plot_key(city, sector, no)
        keys[key] += 1

        # رموز بدل القيم + مسافات + القوائم
        for name in sh.idx:
            v = g(name)
            if is_placeholder(v) or (isinstance(v, str) and v == '' and name not in ('المقاسم المدموجة',)):
                pass
        ph_cols = [n for n in sh.idx if is_placeholder(g(n))]
        if ph_cols:
            for n in ph_cols[:1]:
                flag('placeholder', n, g(n), f'و{len(ph_cols) - 1} أعمدة أخرى في السطر' if len(ph_cols) > 1 else None)
            ISS.counts['placeholder'][city] += len(ph_cols) - 1

        for name, lst in PLOT_LIST_COLS.items():
            v = g(name)
            if is_blank(v) or is_placeholder(v):
                continue
            s = str(v)
            allowed = lists.get(lst, [])
            if s in allowed:
                continue
            if s.strip() in allowed or re.sub(r'\s+', ' ', s).strip() in allowed:
                flag('extra_spaces', name, f'«{s}»')
            elif name == 'نوع الترخيص الإداري' and s.strip() == 'نهائي':
                flag('not_in_list', name, s, 'القائمة: مؤقت / دائم')
            else:
                flag('not_in_list', name, s)

        # التواريخ
        for name in PLOT_DATE_COLS:
            v = g(name)
            if is_blank(v):
                continue
            d, prob = date_of(v)
            if isinstance(v, str) and '\n' in v:
                flag('multi_value', name, v.replace('\n', ' ⏎ '))
            elif prob == 'text':
                flag('date_text', name, v)
            elif prob in ('invalid', 'zero', 'number'):
                flag('date_invalid', name, v, {'zero': 'تاريخ صفري (00:00:00)', 'number': 'رقم في خانة تاريخ'}.get(prob))
            if d and d > REPORT_END:
                flag('date_future', name, d.isoformat())

        # الأرقام
        nums = {}
        for name in PLOT_NUM_COLS:
            v = g(name)
            if is_blank(v) or is_placeholder(v):
                nums[name] = None
                continue
            x, was_text = num(v)
            nums[name] = x
            if was_text:
                flag('number_text', name, v)

        area = nums.get('المساحة م²')
        if not area:
            flag('area_missing', 'المساحة م²', g('المساحة م²'))

        # رقم المقسم
        sno = show(no).strip()
        if '\\' in sno or '+' in sno:
            flag('plot_no_format', 'رقم المقسم', sno)

        # المرحلة والمستثمر
        phase = txt(g('مرحلة المقسم'))
        bucket = PHASE_BUCKET.get(phase) if phase else None
        inv = txt(g('اسم المستثمر الحالي'))
        inv_real = inv if inv and not SUSPICIOUS_INVESTOR.match(inv) else None
        if inv and not inv_real and inv != 'لا يوجد':
            flag('investor_suspicious', 'اسم المستثمر الحالي', inv)
        if inv and NAME_NOTES.search(inv):
            flag('name_has_notes', 'اسم المستثمر الحالي', inv)
        if bucket == 'مخصص' and not inv_real and inv != 'لا يوجد':
            if not inv:
                flag('phase_investor', 'اسم المستثمر الحالي', None, f'المرحلة «{phase}» بلا مستثمر')
        if bucket == 'شاغر' and inv_real:
            flag('phase_investor', 'مرحلة المقسم', phase, f'وعليه المستثمر «{inv_real}»')
        allocated = bucket == 'مخصص' or (bucket is None and bool(inv_real))
        if bucket is None:
            bucket = 'مخصص' if inv_real else ('شاغر' if inv == 'لا يوجد' else 'غير محدد')

        # الحقول الإلزامية
        req = ['القطاع', 'رقم المقسم', 'تصنيف المقسم', 'مرحلة المقسم', 'حالة التخديم']
        if allocated:
            req += ['نوع المستثمر', 'اسم المستثمر الحالي', 'الجنسية', 'رقم قرار التخصيص', 'تاريخ قرار التخصيص', 'نمط الاستثمار']
        if txt(g('تصنيف المقسم')) == 'منشآت صناعية' and allocated:
            req += ['فئة الصناعة']
        if txt(g('طريقة الدفع')) == 'تقسيط':
            req += ['عدد الأقساط', 'دورية الأقساط']
        missing = [n for n in req if n in sh.idx and is_blank(g(n))]
        notes = txt(g('ملاحظات'))
        if missing and not notes:
            flag('required_missing', missing[0], None, ('و: ' + '، '.join(missing[1:])) if len(missing) > 1 else None)
            ISS.counts['required_missing'][city] += len(missing) - 1
        if notes and 'لم أتمكن' in notes:
            flag('notes_missing_info', 'ملاحظات', notes)

        # الدمج
        mflag = txt(g('هل المقسم مدموج مع مقاسم أخرى؟'))
        mlist = g('المقاسم المدموجة')
        ml = txt(mlist)
        if mflag == 'نعم' and (not ml or ml == 'لا'):
            flag('merge_inconsistent', 'المقاسم المدموجة', mlist, 'الدمج = نعم')
        elif mflag == 'لا' and ml and ml not in ('لا', 'لا يوجد'):
            flag('merge_inconsistent', 'المقاسم المدموجة', ml, 'الدمج = لا')
        elif mflag != 'نعم' and ml == 'لا':
            flag('merge_inconsistent', 'المقاسم المدموجة', ml, '«لا» في خانة أرقام المقاسم')
        if ml and ml not in ('لا', 'لا يوجد'):
            seps = set()
            if '+' in ml: seps.add('+')
            if re.search(r'\d\s*-\s*\d', ml): seps.add('-')
            if '،' in ml or ',' in ml: seps.add('،')
            if 'حتى' in ml: seps.add('من…حتى')
            if re.search(r'[a-zA-Z\d]\s+[a-zA-Z\d]', ml) and not seps: seps.add('مسافة')
            MERGE_SEPS[city].update(seps or {'—'})

        # الإيجار
        leased = txt(g('هل المقسم مؤجر؟'))
        tenant = txt(g('اسم المستأجر'))
        if leased == 'نعم' and not tenant:
            flag('lease_inconsistent', 'اسم المستأجر', None, 'مؤجر = نعم')
        elif leased != 'نعم' and tenant and tenant not in ('لا يوجد',):
            flag('lease_inconsistent', 'هل المقسم مؤجر؟', leased, f'وفيه مستأجر «{tenant}»')

        # أكثر من قيمة في خانة (غير التواريخ)
        for n in ('رقم قرار الترخيص الصناعي للمستأجر', 'اسم المستأجر', 'رقم قرار الترخيص الصناعي', 'رقم عقد البيع'):
            v = g(n)
            if isinstance(v, str) and '\n' in v.strip():
                flag('multi_value', n, v.replace('\n', ' ⏎ '))

        # الجنسية/الدولة
        nat, country = txt(g('الجنسية')), txt(g('الدولة (للأجنبي)'))
        if nat == 'سوري' and country:
            flag('nationality_country', 'الدولة (للأجنبي)', country, 'الجنسية سوري')
        elif nat == 'أجنبي' and not country:
            flag('nationality_country', 'الدولة (للأجنبي)', None, 'الجنسية أجنبي بلا دولة')

        alloc_d, _ = date_of(g('تاريخ قرار التخصيص'))
        rec = {
            '_id': f'{city}-{rn}', '_src': {'sheet': T, 'row': rn}, '_review': why,
            'المدينة': city, 'القطاع': txt(sector), 'رقم المقسم': sno, 'المساحة م²': area,
            'تصنيف المقسم': txt(g('تصنيف المقسم')), 'فئة الصناعة': txt(g('فئة الصناعة')), 'اسم النشاط الصناعي': txt(g('اسم النشاط الصناعي')),
            'مرحلة المقسم': phase, 'الحالة': bucket, 'حالة التخديم': txt(g('حالة التخديم')),
            'نوع المستثمر': txt(g('نوع المستثمر')), 'اسم المستثمر الحالي': inv, 'الجنسية': nat, 'الدولة (للأجنبي)': country,
            'مدموج؟': mflag, 'المقاسم المدموجة': ml, 'تاريخ قرار التخصيص': alloc_d.isoformat() if alloc_d else None,
            'نمط الاستثمار': txt(g('نمط الاستثمار')), 'نوع الترخيص الإداري': txt(g('نوع الترخيص الإداري')),
            'رقم رخصة البناء': txt(g('رقم رخصة البناء')), 'رقم الترخيص الإداري': txt(g('رقم الترخيص الإداري')),
            'سعر المتر': nums.get('سعر المتر عند التعاقد'), 'العملة': txt(g('العملة')), 'طريقة الدفع': txt(g('طريقة الدفع')),
            'عدد الأقساط': nums.get('عدد الأقساط'), 'حالة الأقساط': txt(g('حالة الأقساط (تلقائي)')),
            'مؤجر؟': leased, 'اسم المستأجر': tenant, 'خُصص سابقاً؟': txt(g('هل خُصص المقسم لمستثمر سابقاً؟')),
            'ملاحظات': notes,
        }
        # حقول إضافية لجداول التراخيص والإيجارات والعقود (التاريخ كتاريخ، أو كما ورد إن لم يُقرأ)
        for n in EXTRA_TEXT:
            rec[n] = txt(g(n))
        for n in EXTRA_DATES:
            v = g(n)
            d, _ = date_of(v)
            rec[n] = d.isoformat() if d else txt(v)
        rec['قيمة المقسم تقسيطاً'] = nums.get('قيمة المقسم تقسيطاً بعد عوامل التثقيل')
        rec['نسبة الدفعة الأولى %'] = nums.get('نسبة الدفعة الأولى %')
        plots.append(rec)

    # تكرار المفتاح
    for k, n in keys.items():
        if n > 1:
            rows = [p for p in plots if plot_key(city, p['القطاع'], p['رقم المقسم']) == k]
            for p in rows:
                p['_review'].append(f'مقسم مكرر: نفس المفتاح في {n} سطور')
            ISS.add('dup_key', city, sheet=T, row=rows[0]['_src']['row'] if rows else None, col=sh.col('رقم المقسم'),
                    value=k, note=f'{n} سطور: ' + '، '.join(str(p['_src']['row']) for p in rows[:6]), n=n)

    # اكتمال الأعمدة
    comp = {}
    by_row = dict(sh.rows)
    plot_rows = [by_row[p['_src']['row']] for p in plots]
    for name in COMPLETENESS_COLS:
        if name not in sh.idx or not plot_rows:
            comp[name] = None
            continue
        good = sum(1 for r in plot_rows if not is_blank(sh.get(r, name)) and not is_placeholder(sh.get(r, name)))
        comp[name] = round(100 * good / len(plot_rows))
    return sh, plots, comp


MERGE_SEPS = defaultdict(set)
INST_ROWS = []

EXTRA_TEXT = ['رقم السجل التجاري', 'رقم طلب الاكتتاب', 'رقم قرار الترخيص الصناعي', 'رقم قرار التخصيص', 'رقم عقد البيع',
              'رقم السجل الصناعي', 'حاصل على بيان ملكية؟', 'نظام الاستثمار', 'دورية الأقساط', 'تمت التسوية؟',
              'نوع الاستعمال الخاص', 'نوع المبنى الخدمي العام', 'رقم قرار الترخيص الصناعي للمستأجر', 'رقم السجل الصناعي للمستأجر']
EXTRA_DATES = ['تاريخ طلب الاكتتاب', 'تاريخ قرار الترخيص الصناعي', 'تاريخ عقد البيع', 'تاريخ رخصة البناء', 'تاريخ الترخيص الإداري',
               'تاريخ السجل الصناعي', 'تاريخ قرار الترخيص الصناعي للمستأجر', 'تاريخ السجل الصناعي للمستأجر']


def process_installments(city, f, plots):
    T = 'الأقساط'
    rows = f['sheets'].get('الأقساط', [])
    if not rows:
        return None
    sh = Sheet(city, f['name'], T, rows)
    by_key = {plot_key(city, p['القطاع'], p['رقم المقسم']): p for p in plots}
    per_plot = Counter()
    receipts = Counter()
    rec_rows = defaultdict(list)
    tot = paid = unpaid = overdue = no_due = 0
    overdue_val = paid_val = due_val = 0.0
    overdue_plots = set()
    by_year = defaultdict(lambda: {'مدفوع': 0, 'غير مدفوع': 0})
    for rn, r in sh.rows:
        if is_example(r, city):
            ISS.add('example_row', city, sheet=T, row=rn, value=' | '.join(show(v) for v in r[:5] if not is_blank(v)))
            continue
        g = lambda n: sh.get(r, n)
        key_txt = txt(g('المقسم'))
        k = plot_key(city, g('القطاع'), g('رقم المقسم'))
        if k not in by_key and key_txt:
            # المفتاح التلقائي «المدينة | القطاع | الرقم»
            parts = [x.strip() for x in key_txt.split('|')]
            if len(parts) == 3:
                k = plot_key(city, parts[1], parts[2])
        if k not in by_key:
            ISS.add('inst_orphan', city, sheet=T, row=rn, col='A', value=key_txt)
        per_plot[k] += 1
        tot += 1
        val, _ = num(g('قيمة القسط'))
        due, _ = date_of(g('تاريخ الاستحقاق'))
        is_paid = txt(g('مدفوع؟')) == 'نعم'
        if not val:
            ISS.add('inst_value', city, sheet=T, row=rn, col=sh.col('قيمة القسط'), value=g('قيمة القسط'), note=key_txt)
        if not due:
            no_due += 1
            ISS.add('inst_due', city, sheet=T, row=rn, col=sh.col('تاريخ الاستحقاق'), value=g('تاريخ الاستحقاق'), note=key_txt)
        if is_paid:
            paid += 1
            paid_val += val or 0
            rno, rdate = txt(g('رقم الإيصال')), g('تاريخ الإيصال')
            if not rno or is_blank(rdate):
                ISS.add('inst_receipt', city, sheet=T, row=rn, col=sh.col('رقم الإيصال'), value=rno, note=key_txt)
            elif rno:
                rk = (rno, show(rdate))
                receipts[rk] += 1
                rec_rows[rk].append(rn)
        else:
            unpaid += 1
            if due and due <= REPORT_END:
                overdue += 1
                overdue_val += val or 0
                overdue_plots.add(k)
            else:
                due_val += val or 0
        if due:
            by_year[str(due.year)]['مدفوع' if is_paid else 'غير مدفوع'] += 1
        rv = []
        if not val: rv.append('قيمة القسط فارغة أو صفر')
        if not due: rv.append('بلا تاريخ استحقاق')
        if is_paid and (not txt(g('رقم الإيصال')) or is_blank(g('تاريخ الإيصال'))): rv.append('مدفوع بلا إيصال')
        if k not in by_key: rv.append('المقسم غير موجود في شيت المقاسم')
        rd, _ = date_of(g('تاريخ الإيصال'))
        lira, _ = num(g('القيمة بالليرة'))
        usd, _ = num(g('القيمة بالدولار'))
        INST_ROWS.append({
            '_id': f'{city}-inst-{rn}', '_src': rn, '_review': rv, 'المدينة': city, 'المقسم': k.split(' | ', 1)[1],
            'رقم القسط': num(g('رقم القسط'))[0], 'قيمة القسط': val, 'تاريخ الاستحقاق': due.isoformat() if due else None,
            'مدفوع؟': txt(g('مدفوع؟')), 'الوضع': 'مدفوع' if is_paid else ('بلا تاريخ' if not due else 'متأخر' if due <= REPORT_END else 'غير مستحق بعد'),
            'رقم الإيصال': txt(g('رقم الإيصال')), 'تاريخ الإيصال': rd.isoformat() if rd else None, 'القيمة بالليرة': lira, 'القيمة بالدولار': usd,
        })
    for rk, n in receipts.items():
        if n > 1:
            ISS.add('inst_receipt_dup', city, sheet=T, row=rec_rows[rk][0], value=f'{rk[0]} بتاريخ {rk[1]}',
                    note=f'{n} مرات، السطور: ' + '، '.join(map(str, rec_rows[rk][:6])), n=n)
    # المطابقة مع عدد الأقساط
    for p in plots:
        k = plot_key(city, p['القطاع'], p['رقم المقسم'])
        n = p.get('عدد الأقساط')
        if p.get('طريقة الدفع') == 'تقسيط' and n and per_plot.get(k, 0) != int(n):
            ISS.add('inst_count', city, sheet='المقاسم', row=p['_src']['row'], value=k,
                    note=f'عدد الأقساط {int(n)}، المسجل {per_plot.get(k, 0)}')
            p['_review'].append(f'عدد الأقساط {int(n)} والمسجل في شيت الأقساط {per_plot.get(k, 0)}')
        p['أقساط مسجلة'] = per_plot.get(k, 0) or None
        if k in overdue_plots:
            p['عليه أقساط متأخرة'] = 'نعم'
    if tot == 0:
        return None
    return dict(total=tot, paid=paid, unpaid=unpaid, overdue=overdue, overduePlots=len(overdue_plots), noDue=no_due,
                paidValue=round(paid_val), overdueValue=round(overdue_val), notDueValue=round(due_val),
                byYear=[{'year': y, **v} for y, v in sorted(by_year.items())])


def process_prev(city, f, plots):
    T = 'التخصيصات السابقة'
    rows = f['sheets'].get(T, [])
    sh = Sheet(city, f['name'], T, rows)
    keys = Counter()
    items = []
    for rn, r in sh.rows:
        if is_example(r, city):
            ISS.add('example_row', city, sheet=T, row=rn, value=' | '.join(show(v) for v in r[:5] if not is_blank(v)))
            continue
        g = lambda n: sh.get(r, n)
        k = plot_key(city, g('القطاع'), g('رقم المقسم'))
        keys[k] += 1
        ad, _ = date_of(g('تاريخ التخصيص'))
        cd, cprob = date_of(g('تاريخ إلغاء التخصيص'))
        if is_blank(g('تاريخ إلغاء التخصيص')):
            ISS.add('prev_cancel_date', city, sheet=T, row=rn, col=sh.col('تاريخ إلغاء التخصيص'), note=txt(g('المقسم')))
        elif cprob == 'text':
            ISS.add('date_text', city, sheet=T, row=rn, col=sh.col('تاريخ إلغاء التخصيص'), value=g('تاريخ إلغاء التخصيص'))
        if isinstance(g('تاريخ التخصيص'), dt.time) or (_ := date_of(g('تاريخ التخصيص'))[1]) == 'zero':
            ISS.add('date_invalid', city, sheet=T, row=rn, col=sh.col('تاريخ التخصيص'), value=g('تاريخ التخصيص'), note='تاريخ صفري (00:00:00)')
        if cd and cd > REPORT_END:
            ISS.add('date_future', city, sheet=T, row=rn, col=sh.col('تاريخ إلغاء التخصيص'), value=cd.isoformat())
        items.append({'المقسم': txt(g('المقسم')), 'المستثمر السابق': txt(g('اسم المستثمر السابق')),
                      'تاريخ التخصيص': ad.isoformat() if ad else None, 'تاريخ الإلغاء': cd.isoformat() if cd else (txt(g('تاريخ إلغاء التخصيص'))),
                      'سبب الإلغاء': txt(g('سبب الإلغاء')), 'التفاصيل': txt(g('تفاصيل السبب')), '_row': rn})
    for p in plots:
        if p.get('خُصص سابقاً؟') == 'نعم' and keys.get(plot_key(city, p['القطاع'], p['رقم المقسم']), 0) == 0:
            ISS.add('prev_missing', city, sheet='المقاسم', row=p['_src']['row'], value=plot_key(city, p['القطاع'], p['رقم المقسم']))
    return items


# ───────────────────────── الخطة الاستثمارية ─────────────────────────

def process_invest(city, f):
    T = 'الخطة الاستثمارية'
    sh = Sheet(city, f['name'], T, f['sheets'][T])
    canon = REF_HEADERS[T]
    if sh.headers != canon:
        extra = [h for h in sh.headers if h and h not in canon]
        missing = [h for h in canon if h not in sh.headers]
        ISS.add('old_template', city, sheet=T, row=1, value='أعمدة زائدة: ' + '، '.join(extra),
                note='أعمدة ناقصة: ' + '، '.join(missing))
    projects = []
    for rn, r in sh.rows:
        g = lambda n: sh.get(r, n)
        if is_example(r, city):
            ISS.add('example_row', city, sheet=T, row=rn, value=' | '.join(show(v) for v in r[:5] if not is_blank(v)))
            continue
        if is_blank(g('اسم المشروع')):
            continue
        p = {'_row': rn, 'المدينة': city, 'اسم المشروع': txt(g('اسم المشروع')), 'الحساب الفرعي': txt(g('الحساب الفرعي')),
             'الحساب الجزئي': txt(g('الحساب الجزئي')), 'نوع المشروع': txt(g('نوع المشروع')), 'القطاع': txt(g('القطاع')),
             'حالة المشروع': txt(g('حالة المشروع')), 'الجهة المنفذة': txt(g('الجهة المنفذة')), 'سبب التوقف': txt(g('سبب التوقف')),
             'ملاحظات': txt(g('ملاحظات')), '_review': []}
        for n, k in [('الاعتماد المخطط', 'planned'), ('الاعتماد المعدل', 'revised'), ('قيمة العقد', 'contract'),
                     ('المبلغ المنفق حتى تاريخه', 'spent'), ('نسبة التنفيذ المادي %', 'physical'), ('نسبة التنفيذ المالي %', 'financial')]:
            x, was_text = num(g(n))
            if was_text and x is not None:
                ISS.add('number_text', city, sheet=T, row=rn, col=sh.col(n), value=g(n))
            p[k] = x
        for n, k in [('تاريخ التعاقد', 'dContract'), ('تاريخ المباشرة', 'dStart'), ('تاريخ التوقف', 'dStop'), ('تاريخ الانتهاء', 'dEnd'),
                     ('تاريخ الإعلان', 'dAnnounce'), ('تاريخ الإغلاق', 'dClose')]:
            d, prob = date_of(g(n))
            if prob == 'text':
                ISS.add('date_text', city, sheet=T, row=rn, col=sh.col(n), value=g(n))
            elif prob in ('invalid', 'zero', 'number'):
                ISS.add('date_invalid', city, sheet=T, row=rn, col=sh.col(n), value=g(n))
            p[k] = d.isoformat() if d else None
        projects.append(p)

    # النسب ككسور: كل القيم بين 0 و1 وفيها كسر
    for key, label in [('physical', 'نسبة التنفيذ المادي %'), ('financial', 'نسبة التنفيذ المالي %')]:
        vals = [p[key] for p in projects if p[key] is not None]
        if vals and max(vals) <= 1 and any(0 < v < 1 or v == 1 for v in vals if v):
            for p in projects:
                if p[key]:
                    ISS.add('pct_fraction', city, sheet=T, row=p['_row'], col=sh.col(label), value=p[key],
                            note=f'{label}: تُقرأ {p[key] * 100:g}%')
                    p['_review'].append(f'{label} مكتوبة {show(p[key])} — عرضناها {p[key] * 100:g}%')
                    p[key] = p[key] * 100
        for p in projects:
            if p[key] is not None and (p[key] > 100 or p[key] < 0):
                ISS.add('pct_range', city, sheet=T, row=p['_row'], col=sh.col(label), value=p[key])
                p['_review'].append(f'{label} خارج المدى: {show(p[key])}')

    for p in projects:
        rn = p['_row']
        st = p['حالة المشروع']
        if p['spent'] and p['contract'] and p['spent'] > p['contract'] * 1.0001:
            ISS.add('spent_gt', city, sheet=T, row=rn, value=f"{p['spent']:,.0f} > {p['contract']:,.0f}", note=p['اسم المشروع'][:60])
            p['_review'].append('المنفق أكبر من قيمة العقد')
        if not st:
            ISS.add('status_missing', city, sheet=T, row=rn, col=sh.col('حالة المشروع'), note=p['اسم المشروع'][:60])
            p['_review'].append('حالة المشروع فارغة')
        else:
            need = []
            if st != 'منتهٍ' or True:
                if 'dContract' in p and not p['dContract'] and 'تاريخ التعاقد' in sh.idx:
                    need.append('تاريخ التعاقد')
            if st == 'متعاقد وقيد التنفيذ' and not p['dStart'] and 'تاريخ المباشرة' in sh.idx:
                need.append('تاريخ المباشرة')
            if st == 'متعاقد ومتوقف':
                if not p['dStop'] and 'تاريخ التوقف' in sh.idx:
                    need.append('تاريخ التوقف')
                if not p['سبب التوقف']:
                    need.append('سبب التوقف')
            if st == 'منتهٍ' and not p['dEnd'] and 'تاريخ الانتهاء' in sh.idx:
                need.append('تاريخ الانتهاء')
            if need:
                ISS.add('status_dates', city, sheet=T, row=rn, value=st, note='ناقص: ' + '، '.join(need))
                p['_review'].append(f'الحالة «{st}» ينقصها: ' + '، '.join(need))
        ex = p['الجهة المنفذة'] or ''
        if st == 'متعاقد ومتوقف' and re.search(r'(تقشف|دراسة|دفتر شروط|تعويض)', ex):
            ISS.add('stop_reason_in_exec', city, sheet=T, row=rn, col=sh.col('الجهة المنفذة'), value=ex)
            p['_review'].append(f'«{ex}» في عمود الجهة المنفذة')
        if p['القطاع'] in ('-', '_'):
            p['القطاع'] = None
    by_row = dict(sh.rows)
    for p in projects:
        v = sh.get(by_row[p['_row']], 'القطاع')
        if is_placeholder(v):
            ISS.add('placeholder', city, sheet=T, row=p['_row'], col=sh.col('القطاع'), value=v)
    return projects


# ───────────────────────── الإنتاجية ─────────────────────────

PROD_FIELDS = [
    ('الماء - شرب م³', 'waterDrink'), ('الماء - صناعي م³', 'waterInd'), ('إجمالي استطاعة محطة التحويل MW', 'mwTotal'),
    ('الاستطاعة المتاحة MW', 'mwAvail'), ('الاستهلاك الحالي MW', 'mwUse'), ('العجز أو الفائض MW (تلقائي)', 'mwGap'),
    ('عدد المنشآت المخدمة من الهاتف الأرضي', 'landline'), ('عدد المنشآت المخدمة من النت الفضائي', 'satNet'),
    ('عدد المنشآت غير المخدمة من النت', 'noNet'), ('عدد خطوط الهاتف العاملة', 'linesOk'), ('عدد خطوط الهاتف الناقصة', 'linesMissing'),
    ('عدد أبراج الخليوي العاملة', 'towers'), ('عدد المواقع التي تعاني نقصاً في التغطية', 'weakSites'),
    ('الفيول طن', 'fuelOil'), ('المازوت الصناعي لتر', 'diesel'), ('الغاز م³', 'gas'), ('الفحم الحجري طن', 'coal'),
]


def process_prod(city, f):
    T = 'الإنتاجية'
    sh = Sheet(city, f['name'], T, f['sheets'][T])
    recs = []
    for rn, r in sh.rows:
        g = lambda n: sh.get(r, n)
        if is_blank(g('المدينة')) and all(is_blank(g(n)) for n, _ in PROD_FIELDS):
            continue
        d, prob = date_of(g('الشهر'))
        rec = {'_row': rn, 'month': d.isoformat() if d else show(g('الشهر')), 'notes': txt(g('ملاحظات')), '_review': []}
        if not d or d != dt.date(2026, 10, 1):
            note = None
            if d and d.year == 2026 and d.month == 1 and d.day in (9, 10):
                note = 'يبدو أن اليوم والشهر انقلبا (أو كُتب شهر خاطئ)'
            ISS.add('prod_month', city, sheet=T, row=rn, col=sh.col('الشهر'), value=g('الشهر'), note=note)
            rec['_review'].append(f"الشهر مكتوب {show(g('الشهر'))} بدل 2026-10-01")
        for n, k in PROD_FIELDS:
            x, was_text = num(g(n))
            if was_text and x is not None:
                ISS.add('number_text', city, sheet=T, row=rn, col=sh.col(n), value=g(n))
            rec[k] = x
        if rec['mwAvail'] is not None and rec['mwUse'] is not None:
            calc = rec['mwAvail'] - rec['mwUse']
            rec['mwGapCalc'] = calc
            if rec['mwGap'] is not None and abs(rec['mwGap'] - calc) > 0.01:
                ISS.add('prod_calc', city, sheet=T, row=rn, col=sh.col('العجز أو الفائض MW (تلقائي)'), value=rec['mwGap'],
                        note=f"المتاح {show(rec['mwAvail'])} − الاستهلاك {show(rec['mwUse'])} = {show(calc)}")
                rec['_review'].append(f"العجز/الفائض مكتوب {show(rec['mwGap'])} والحساب {show(calc)}")
        if rec['mwTotal'] is not None and rec['mwAvail'] is not None and rec['mwAvail'] > rec['mwTotal']:
            ISS.add('prod_logic', city, sheet=T, row=rn, value=f"المتاح {show(rec['mwAvail'])} > الإجمالي {show(rec['mwTotal'])}")
        zeros = [n for n, k in PROD_FIELDS if rec[k] == 0]
        if rec['notes'] and re.search(r'(الصفرية|غير متوفرة)', rec['notes']) and zeros:
            ISS.add('prod_zero_unknown', city, sheet=T, row=rn, value=f'{len(zeros)} خانة = 0', note=rec['notes'][:120])
            rec['unknownZeros'] = True
        recs.append(rec)
    return recs[0] if recs else None


# ───────────────────────── الإنجازات والتحديات ─────────────────────────

def process_ach(city, f):
    T = 'الإنجازات والتحديات'
    sh = Sheet(city, f['name'], T, f['sheets'][T])
    items = []
    for rn, r in sh.rows:
        g = lambda n: sh.get(r, n)
        ex = is_example(r, city)
        rcity = txt(g('المدينة'))
        if ex is True:
            ISS.add('example_row', city, sheet=T, row=rn, value=txt(g('الوصف')))
            if rcity and rcity != city:
                ISS.add('ach_city', city, sheet=T, row=rn, col='A', value=rcity)
            continue
        kind, desc = txt(g('النوع')), txt(g('الوصف'))
        if not kind and not desc:
            continue
        review = []
        if ex == 'maybe':
            review.append('النص مطابق حرفياً لسطر المثال في القالب')
            ISS.add('example_row', city, sheet=T, row=rn, value=desc, note='قد يكون بنداً حقيقياً لباب الهوى: النص مطابق لمثال القالب')
        if not kind or not desc:
            ISS.add('ach_empty', city, sheet=T, row=rn, value=kind or desc)
            review.append('بند ناقص')
        d, prob = date_of(g('الشهر'))
        if not d or (d.year, d.month) != (2026, 10):
            ISS.add('ach_month', city, sheet=T, row=rn, col='B', value=g('الشهر'))
            review.append(f"الشهر مكتوب {show(g('الشهر'))}")
        elif d.day != 1:
            review.append(f'الشهر مكتوب كيوم ({d.isoformat()})')
        items.append({'_row': rn, 'type': kind, 'desc': desc, 'month': d.isoformat() if d else show(g('الشهر')), '_review': review})
    return items


# ───────────────────────── التشغيل ─────────────────────────

REF_HEADERS = {}


def summarize_plots(plots, inst):
    def cnt(key, top=None):
        c = Counter(p.get(key) or 'غير محدد' for p in plots)
        out = [{'name': k, 'value': v} for k, v in c.most_common()]
        return out[:top] if top else out

    alloc = [p for p in plots if p['الحالة'] == 'مخصص']
    vacant = [p for p in plots if p['الحالة'] == 'شاغر']
    inv = Counter(p['اسم المستثمر الحالي'] for p in alloc if p['اسم المستثمر الحالي'] and not SUSPICIOUS_INVESTOR.match(p['اسم المستثمر الحالي']))
    years = Counter(p['تاريخ قرار التخصيص'][:4] for p in plots if p.get('تاريخ قرار التخصيص'))
    return {
        'plots': len(plots),
        'allocated': len(alloc),
        'vacant': len(vacant),
        'subscribed': sum(1 for p in plots if p['الحالة'] == 'مكتتب عليه'),
        'undetermined': sum(1 for p in plots if p['الحالة'] == 'غير محدد'),
        'totalArea': round(sum(p['المساحة م²'] or 0 for p in plots)),
        'allocArea': round(sum(p['المساحة م²'] or 0 for p in alloc)),
        'vacantArea': round(sum(p['المساحة م²'] or 0 for p in vacant)),
        'investors': len(inv),
        'merged': sum(1 for p in plots if p['مدموج؟'] == 'نعم'),
        'leased': sum(1 for p in plots if p['مؤجر؟'] == 'نعم'),
        'adminLicenses': sum(1 for p in plots if p['رقم الترخيص الإداري']),
        'buildingLicenses': sum(1 for p in plots if p['رقم رخصة البناء']),
        'foreign': sum(1 for p in plots if p['الجنسية'] == 'أجنبي'),
        'installmentPlots': sum(1 for p in plots if p['طريقة الدفع'] == 'تقسيط'),
        'flagged': sum(1 for p in plots if p['_review']),
        'byStatus': cnt('الحالة'),
        'byPhase': cnt('مرحلة المقسم'),
        'byService': cnt('حالة التخديم'),
        'byCategory': cnt('فئة الصناعة'),
        'bySector': cnt('القطاع', 25),
        'byClass': cnt('تصنيف المقسم'),
        'byInvestorType': [x for x in cnt('نوع المستثمر') if x['name'] != 'غير محدد' or True],
        'byNationality': cnt('الجنسية'),
        'byCountry': [x for x in cnt('الدولة (للأجنبي)') if x['name'] not in ('غير محدد',)],
        'byAdminType': [x for x in cnt('نوع الترخيص الإداري') if x['name'] != 'غير محدد'],
        'byInstStatus': [x for x in cnt('حالة الأقساط') if x['name'] != 'غير محدد'],
        'byCurrency': [x for x in cnt('العملة') if x['name'] != 'غير محدد'],
        'byInvestMode': cnt('نمط الاستثمار'),
        'byActivity': [x for x in cnt('اسم النشاط الصناعي', 12) if x['name'] != 'غير محدد'],
        'topInvestors': [{'name': k, 'value': v} for k, v in inv.most_common(10)],
        'allocByYear': [{'year': y, 'value': v} for y, v in sorted(years.items()) if '1990' <= y <= '2026'],
        'installments': inst,
    }


def main():
    print('قراءة الملفات…')
    data = {c: load_city(d) for d, c in CITY_DIRS.items() if os.path.isdir(os.path.join(ROOT, d))}

    # العناوين المرجعية: من ملف عدرا (مطابق للإصدار 1.2)
    ref = data['عدرا']
    REF_HEADERS['المقاسم'] = [re.sub(r'\s+', ' ', str(h)).strip() if h else None for h in ref['plots']['sheets']['المقاسم'][0][1]]
    while REF_HEADERS['المقاسم'] and REF_HEADERS['المقاسم'][-1] is None:
        REF_HEADERS['المقاسم'].pop()
    REF_HEADERS['الخطة الاستثمارية'] = Sheet('عدرا', '', '', ref['invest']['sheets']['الخطة الاستثمارية']).headers
    lists = check_lists_map(ref['plots']['sheets']['القوائم'])

    out_cities, all_plots, files_table = {}, [], []
    for city in CITY_ORDER:
        files = data.get(city, {})
        print('•', city, list(files))
        frow = {'city': city, 'files': {}}
        for kind in TEMPLATES:
            f = files.get(kind)
            if f:
                check_filename(city, kind, f['name'])
                frow['files'][kind] = {'name': f['name'], 'size': f['size']}
            else:
                frow['files'][kind] = None
        c = {'city': city}
        if 'plots' in files:
            sh, plots, comp = process_plots(city, files['plots'], lists)
            inst = process_installments(city, files['plots'], plots)
            prev = process_prev(city, files['plots'], plots)
            c['summary'] = summarize_plots(plots, inst)
            c['completeness'] = comp
            c['previous'] = prev
            frow['files']['plots']['rows'] = len(plots)
            frow['files']['plots']['installments'] = inst['total'] if inst else 0
            frow['files']['plots']['previous'] = len(prev)
            all_plots += plots
        if 'invest' in files:
            c['projects'] = process_invest(city, files['invest'])
            frow['files']['invest']['rows'] = len(c['projects'])
        if 'prod' in files:
            c['productivity'] = process_prod(city, files['prod'])
            frow['files']['prod']['rows'] = 1 if c['productivity'] else 0
        if 'ach' in files:
            c['achievements'] = process_ach(city, files['ach'])
            frow['files']['ach']['rows'] = len(c['achievements'])
        out_cities[city] = c
        files_table.append(frow)

    for city, seps in MERGE_SEPS.items():
        if len(seps) > 1:
            ISS.add('merge_format', city, sheet='المقاسم', col='U', value=' / '.join(sorted(seps)),
                    note=f'{len(seps)} صيغ مختلفة لكتابة المقاسم المدموجة في نفس الملف')
    # صيغ مختلفة بين المدن
    issues = ISS.dump()
    for c in CITY_ORDER:
        n_issue_cells = sum(i['counts'][c] for i in issues)
        out_cities[c]['issueCount'] = n_issue_cells
        out_cities[c]['issueTypes'] = sum(1 for i in issues if i['counts'][c])
        out_cities[c]['highTypes'] = sum(1 for i in issues if i['counts'][c] and i['severity'] == 'مرتفع')

    PLOT_COLS = []
    for p in all_plots:
        for k in p:
            if k not in PLOT_COLS:
                PLOT_COLS.append(k)
    for p in all_plots:
        p['_src'] = p['_src']['row']
    out = {
        'generated': dt.datetime.now().isoformat(timespec='seconds'),
        'month': MONTH,
        'cities': CITY_ORDER,
        'files': files_table,
        'byCity': out_cities,
        'issues': issues,
        # المقاسم بصيغة جدول (أسماء الأعمدة مرة واحدة) لتصغير الملف
        'plots': {'cols': PLOT_COLS, 'rows': [[p.get(k) for k in PLOT_COLS] for p in all_plots]},
        'installments': {'cols': list(INST_ROWS[0].keys()) if INST_ROWS else [], 'rows': [list(r.values()) for r in INST_ROWS]},
        'lists': lists,
    }
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'✓ {OUT}  ({os.path.getsize(OUT) / 1e6:.1f} MB) — {len(all_plots)} مقسم، {len(issues)} نوع مشكلة')
    for i in sorted(issues, key=lambda i: -sum(i['counts'].values())):
        print(f"  {sum(i['counts'].values()):>7}  {i['severity']:<6} {i['title']}  {dict((k, v) for k, v in i['counts'].items() if v)}")


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()

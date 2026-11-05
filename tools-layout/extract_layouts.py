"""Export BCU's source-defined Swing geometry and public UI strings.

This is build-time tooling, not a browser backend. It deliberately preserves
unresolved Java expressions and branch conditions instead of inventing bounds.
Run from the repository root: python tools-layout/extract_layouts.py
"""
from __future__ import annotations

import ast
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'upstream/BCU-java-PC/src/main/java/page'
RESOURCES = ROOT / 'upstream/BCU-java-PC/src/main/resources'
LANG = ROOT / 'BCU/assets/lang'
OUT = ROOT / 'web/data'
SECTIONS = ['page', 'info', 'internet', 'util']


def java_unescape(text: str) -> str:
    def replace(match):
        token = match.group(1)
        if token.startswith('u'):
            return chr(int(token.lstrip('u'), 16))
        return {'t': '\t', 'r': '\r', 'n': '\n', 'f': '\f', '\\': '\\'}.get(token, token)
    return re.sub(r'\\(u+[0-9a-fA-F]{4}|.)', replace, text)


def properties(text: str) -> dict[str, str]:
    result = {}
    pending = ''
    for raw in text.splitlines():
        line = pending + raw.lstrip() if pending else raw
        trailing = len(line) - len(line.rstrip('\\'))
        if trailing % 2:
            pending = line[:-1]
            continue
        pending = ''
        line = line.lstrip()
        if not line or line.startswith(('#', '!')):
            continue
        # Java properties permits whitespace and =/: delimiters; these files
        # normally use '='. Escaped delimiters remain part of the key.
        split = re.search(r'(?<!\\)[=:]|(?<!\\)\s', line)
        if split:
            key = line[:split.start()]
            rest = line[split.end():].lstrip()
            if split.group().isspace() and rest.startswith(('=', ':')):
                rest = rest[1:].lstrip()
        else:
            key, rest = line, ''
        result[java_unescape(key)] = java_unescape(rest)
    return result


def load_locales():
    # The installed jar's bundled locale is the desktop fallback, so prefer it
    # to the current upstream source fallback.
    fallback = {}
    jar = ROOT / 'BCU/BCU-0-5-8-8.jar'
    with zipfile.ZipFile(jar) as archive:
        for section in SECTIONS:
            try:
                fallback[section] = properties(archive.read(section + '.properties').decode('utf-8-sig'))
            except KeyError:
                fallback[section] = properties((RESOURCES / (section + '.properties')).read_text(encoding='utf-8-sig'))
    locales = {}
    for folder in sorted(LANG.iterdir()):
        if not folder.is_dir() or len(folder.name) != 2:
            continue
        locales[folder.name] = {}
        for section in SECTIONS:
            strings = dict(fallback[section])
            path = folder / (section + '.properties')
            if path.exists():
                strings.update({key: value for key, value in properties(path.read_text(encoding='utf-8-sig')).items() if value != '(null)'})
            locales[folder.name][section] = strings
    return locales


def mask_comments(source):
    # Preserve offsets and newlines; Java strings can legitimately contain //.
    pattern = r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/'
    return re.sub(pattern, lambda m: m.group() if m.group()[0] in '\"\'' else re.sub(r'[^\n]', ' ', m.group()), source)


def closing(source, start, opening='(', end=')'):
    depth = 0
    quote = None
    escaped = False
    for pos in range(start, len(source)):
        char = source[pos]
        if quote:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in ('"', "'"):
            quote = char
        elif char == opening:
            depth += 1
        elif char == end:
            depth -= 1
            if not depth:
                return pos
    return len(source) - 1


def split_args(source):
    depth = 0
    quote = None
    escaped = False
    last = 0
    parts = []
    for pos, char in enumerate(source):
        if quote:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in ('"', "'"):
            quote = char
        elif char in '([{':
            depth += 1
        elif char in ')]}':
            depth -= 1
        elif char == ',' and depth == 0:
            parts.append(source[last:pos].strip())
            last = pos + 1
    return parts + [source[last:].strip()]


def number(expression, env=None):
    env = env or {}
    try:
        tree = ast.parse(expression, mode='eval').body
        def evaluate(node):
            if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
                return node.value
            if isinstance(node, ast.Name) and node.id in env:
                return env[node.id]
            if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
                value = evaluate(node.operand)
                return -value if isinstance(node.op, ast.USub) else value
            if isinstance(node, ast.BinOp):
                left, right = evaluate(node.left), evaluate(node.right)
                if isinstance(node.op, ast.Add): return left + right
                if isinstance(node.op, ast.Sub): return left - right
                if isinstance(node.op, ast.Mult): return left * right
                if isinstance(node.op, ast.Div): return int(left / right)
            raise ValueError()
        return evaluate(tree)
    except (SyntaxError, ValueError, KeyError, ZeroDivisionError):
        return None


def literal(expression):
    expression = expression.strip()
    if re.fullmatch(r'"(?:\\.|[^"\\])*"', expression):
        return java_unescape(expression[1:-1])
    return None


def locale_ref(expression):
    args = split_args(expression)
    if len(args) >= 2 and literal(args[1]) is not None:
        section = {'MainLocale.PAGE': 'page', 'MainLocale.INFO': 'info', 'MainLocale.INTERNET': 'internet', 'MainLocale.UTIL': 'util', '0': 'page', '1': 'info', '2': 'internet', '3': 'util'}.get(args[0])
        if section:
            return section, literal(args[1])
    match = re.search(r'(?:MainLocale\.getLoc|get)\((MainLocale\.\w+|[0-3])\s*,\s*("(?:\\.|[^"\\])*")\)', expression)
    if match:
        return locale_ref(match.group(1) + ', ' + match.group(2))
    return None


def lookup(locales, section, key):
    text = locales['en'][section].get(key, key)
    # MainLocale expands #key# links inside public text.
    for _ in range(8):
        new = re.sub(r'#([^#]+)#', lambda m: locales['en'][section].get(m.group(1), m.group(1)), text)
        if new == text: break
        text = new
    return text


def fields(source, locales):
    result = {}
    declaration = re.compile(r'(?:private|protected|public)\s+(?:(?:static|final|transient)\s+)*(?P<type>[\w.]+(?:\s*<[^;=]+?>)?(?:\[\])?)\s+(?P<name>\w+)\s*(?:=\s*(?P<init>[^;]+))?;')
    for match in declaration.finditer(source):
        type_name = re.sub(r'<.*>', '', match['type']).replace(' ', '').split('.')[-1]
        # Include custom drawing, table and filter widgets, alongside Swing.
        if not (type_name.startswith('J') or type_name.endswith(('Table', 'Box', 'Tree', 'Head')) or type_name in ('Canvas', 'ViewBox', 'BGBox', 'PartEditTable', 'EditHead', 'LineUpBox')):
            continue
        init = (match['init'] or '').strip()
        field = {'id': match['name'], 'type': type_name, 'text': ''}
        array = re.match(r'new\s+\w+\[(\d+)\]', init)
        if array:
            field['arrayLength'] = int(array.group(1))
        constructor = re.search(r'new\s+[\w.]+(?:<[^;]*?>)?\s*\(', init)
        args_text = ''
        if constructor:
            open_pos = constructor.end() - 1
            args_text = init[open_pos + 1:closing(init, open_pos)]
        ref = locale_ref(args_text or init)
        if ref:
            field.update(section=ref[0], localeKey=ref[1], text=lookup(locales, *ref))
        else:
            arg0 = split_args(args_text)[0] if args_text else ''
            text = literal(arg0)
            if text is not None:
                field['text'] = text
            elif init and type_name in ('JBTN', 'JTG', 'JCB', 'JL', 'JLabel', 'JTF'):
                field['textExpression'] = args_text or init
        if type_name == 'JScrollPane':
            child = split_args(args_text)[0]
            if re.fullmatch(r'\w+', child):
                field['child'] = child
        result[field['id']] = field
    for name, expression in re.findall(r'(\w+)\.setToolTipText\(([^;]+)\);', source):
        if name in result:
            ref = locale_ref(expression)
            result[name]['title'] = lookup(locales, *ref) if ref else literal(expression)
    for name, value in re.findall(r'(\w+)\.setHint\(("(?:\\.|[^"\\])*")\)', source):
        if name in result: result[name]['hint'] = literal(value)
    # Initial state comes only from initialization methods; event handlers can
    # also contain setSelected() and must not be mistaken for defaults.
    initial = ''
    for initialization in re.finditer(r'\bvoid\s+(?:ini|preini)\s*\([^)]*\)\s*\{', source):
        start = initialization.end() - 1
        initial += source[start + 1:closing(source, start, '{', '}')]
    for name, state in re.findall(r'(\w+)\.setSelected\((true|false)\)', initial):
        if name in result: result[name]['initialSelected'] = state == 'true'
    for name, state in re.findall(r'(\w+)\.setEnabled\((true|false)\)', initial):
        if name in result: result[name]['initialEnabled'] = state == 'true'
    return result


def resized_body(source):
    match = re.search(r'\bvoid\s+resized\s*\([^)]*\)\s*\{', source)
    if not match: return '', 0
    start = match.end() - 1
    end = closing(source, start, '{', '}')
    return source[start + 1:end], start + 1


def conditions_at(source, at):
    stack = []
    last_closed = {}
    boundary = 0
    quote = None
    escaped = False
    parentheses = 0
    for pos, char in enumerate(source[:at]):
        if quote:
            if escaped: escaped = False
            elif char == '\\': escaped = True
            elif char == quote: quote = None
            continue
        if char in ('"', "'"):
            quote = char
        elif char == '(':
            parentheses += 1
        elif char == ')':
            parentheses -= 1
        elif char == '{':
            header = source[boundary:pos].strip()
            condition = None
            if_match = re.search(r'\bif\s*\(([\s\S]*)\)\s*$', header)
            if if_match:
                condition = re.sub(r'\s+', ' ', if_match.group(1).strip())
                if header.lstrip().startswith('else'):
                    previous = last_closed.get(len(stack))
                    if previous: condition = f'!({previous}) && ({condition})'
            elif re.search(r'\belse\s*$', header):
                previous = last_closed.get(len(stack))
                if previous: condition = f'!({previous})'
            elif re.search(r'\bfor\s*\(', header):
                condition = 'loop:' + re.sub(r'\s+', ' ', header)
            stack.append(condition)
            boundary = pos + 1
        elif char == '}':
            if stack:
                previous = stack.pop()
                last_closed[len(stack)] = previous
            boundary = pos + 1
        elif char == ';' and parentheses == 0:
            boundary = pos + 1
    return [condition for condition in stack if condition]


def local_numbers(prefix):
    """Resolve uncomplicated source-local constants such as PackEditPage.w.

    Values assigned inside branches/loops are not safe constants. Retain those
    expressions for the runtime instead.
    """
    env = {}
    statements = re.compile(r'\bint\s+([^;\n]+);|\b(\w+)\s*(\+=|-=|=)\s*([^;\n]+);')
    for match in statements.finditer(prefix):
        if conditions_at(prefix, match.start()):
            continue
        if match.group(1):
            for declaration in split_args(match.group(1)):
                if '=' not in declaration: continue
                name, expression = declaration.split('=', 1)
                name = name.strip()
                value = number(expression.strip(), env)
                if value is not None and re.fullmatch(r'\w+', name): env[name] = value
        else:
            name, op, expression = match.group(2, 3, 4)
            value = number(expression.strip(), env)
            if value is not None and (op == '=' or name in env):
                env[name] = value if op == '=' else env[name] + value * (1 if op == '+=' else -1)
            elif name in env:
                del env[name]
    return env


def placements(source, body, offset):
    result = []
    for match in re.finditer(r'(?<![\w.])set\s*\(', body):
        start = match.end() - 1
        end = closing(body, start)
        args = split_args(body[start + 1:end])
        if len(args) != 7 or args[1:3] != ['x', 'y']:
            continue
        identity = re.sub(r'^\([\w.]+\)\s*', '', args[0]).strip()
        conditions = conditions_at(body, match.start())
        prefix = body[:match.start()]
        # Java also permits a one-line else without braces. Its set() still
        # belongs to the negated preceding if branch.
        if re.search(r'\belse\s*$', prefix):
            opening = prefix.rfind('if (')
            if opening >= 0:
                paren = prefix.find('(', opening)
                condition = prefix[paren + 1:closing(prefix, paren)]
                conditions.append(f'!({condition})')
        env = local_numbers(prefix)
        iterations = [({}, conditions)]
        for condition in conditions:
            loop = re.fullmatch(r'loop:for\s*\(int\s+(\w+)\s*=\s*(\d+);\s*\1\s*<\s*(\d+);\s*\1\+\+\)', condition)
            if loop and int(loop[3]) - int(loop[2]) <= 50:
                iterations = [({loop[1]: i}, [c for c in conditions if c != condition]) for i in range(int(loop[2]), int(loop[3]))]
        for iteration, branch in iterations:
            bounds = [number(value, env | iteration) for value in args[3:]]
            item_id = identity
            for variable, value in iteration.items(): item_id = item_id.replace(f'[{variable}]', f'[{value}]')
            item = {'id': item_id, 'bounds': bounds, 'conditions': branch, 'line': source.count('\n', 0, offset + match.start()) + 1}
            if iteration: item['iteration'] = iteration
            if None in bounds:
                item['boundsExpressions'] = args[3:]
            result.append(item)
    return result


def is_default(conditions):
    # Original constructor defaults: animation Large Screen toggle is false;
    # data filter Show Filter is true. Keep unknown branches unresolved.
    known = {'larges.isSelected()': False, '!larges.isSelected()': True,
             'show.isSelected()': True, '!show.isSelected()': False,
             '!(larges.isSelected())': True, '!(!larges.isSelected())': False,
             '!(show.isSelected())': False}
    return all(known.get(condition, False) for condition in conditions)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    locales = load_locales()
    pages = {}
    for path in sorted(SOURCE.rglob('*.java')):
        file_source = mask_comments(path.read_text(encoding='utf-8-sig'))
        for declaration in re.finditer(r'\bclass\s+(\w+)(?:\s*<[^{}]+?>)?\s+extends\s+([\w.]+)', file_source):
            class_start = file_source.find('{', declaration.end())
            class_end = closing(file_source, class_start, '{', '}')
            source = file_source[class_start + 1:class_end]
            body, offset = resized_body(source)
            if not body: continue
            name, parent = declaration.group(1), declaration.group(2).split('.')[-1]
            members = fields(source, locales)
            positions = placements(source, body, offset)
            line_offset = file_source.count('\n', 0, class_start + 1)
            for position in positions:
                position['line'] += line_offset
                indexed = re.fullmatch(r'(\w+)\[(\d+)\]', position['id'])
                if indexed and indexed[1] in members and position['id'] not in members:
                    members[position['id']] = {**members[indexed[1]], 'id': position['id'], 'type': members[indexed[1]]['type'].removesuffix('[]'), 'arrayIndex': int(indexed[2])}
            pages[name] = {'parent': parent, 'source': path.relative_to(ROOT).as_posix(), 'widgets': list(members.values()), 'placements': positions, 'notes': []}
            unknown = [item for item in positions if None in item['bounds']]
            if unknown:
                pages[name]['notes'].append('Dynamic bounds remain as Java expressions; they need the relevant table/filter state at runtime.')
            if any(item['conditions'] for item in positions):
                pages[name]['notes'].append('Placements preserve conditional branches. Apply the branch matching current widget state.')
    def resolve(name, seen=None):
        seen = seen or set()
        if name not in pages or name in seen: return {}, {}
        seen.add(name)
        page = pages[name]
        widgets, positions = resolve(page['parent'], seen)
        widgets.update({item['id']: item for item in page['widgets']})
        for item in page['placements']:
            if (not item['conditions'] or is_default(item['conditions'])) and None not in item['bounds']:
                positions[item['id']] = item['bounds']
        return widgets, positions
    for name, page in pages.items():
        widgets, positions = resolve(name)
        page['resolvedWidgets'] = list(widgets.values())
        page['defaultPlacements'] = positions
    output = {
        'referenceSize': [2300, 1300],
        'scaleRule': 'floor(coordinate * availableSize / referenceSize)',
        'font': {'family': 'Dialog', 'style': 'plain', 'referenceSize': 24, 'rule': 'min(floor(24 * width / 2300), floor(24 * height / 1300))'},
        'baseline': 'Supplied BCU-0-5-8-8.jar; geometry extracted from matching upstream page source, labels use supplied JAR and locale files.',
        'limitations': ['Source extraction records layout declarations, not executable Swing behavior.', 'Loop-indexed and state-dependent placements need runtime evaluation.', 'The installed version and current upstream may differ on screens outside the verified main/viewer baseline.'],
        'pages': pages,
    }
    (OUT / 'layouts.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (OUT / 'locales.json').write_text(json.dumps(locales, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Exported {len(pages)} layouts, {sum(len(p["placements"]) for p in pages.values())} placements, {len(locales)} locales.')
    print(f'MainPage: {len(pages["MainPage"]["defaultPlacements"])} widgets; MusicPage: {len(pages["MusicPage"]["defaultPlacements"])} widgets.')


if __name__ == '__main__':
    main()

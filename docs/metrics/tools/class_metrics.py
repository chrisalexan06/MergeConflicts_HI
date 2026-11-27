import csv, re, sys, os
def classes_in(path):
    src = open(path, encoding='utf-8', errors='replace').read().split('\n')
    out = []
    pat = re.compile(r'^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)')
    for i, line in enumerate(src):
        m = pat.match(line)
        if not m: continue
        depth = 0; started = False; end = None
        for j in range(i, len(src)):
            l = re.sub(r"//.*$", "", src[j])
            l = re.sub(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`", "", l)
            for ch in l:
                if ch == '{': depth += 1; started = True
                elif ch == '}': depth -= 1
            if started and depth <= 0: end = j + 1; break
        out.append((m.group(1), i + 1, end or len(src)))
    return out
def run(root, rawcsv, outcsv):
    funcs = {}
    for r in csv.reader(open(rawcsv, encoding='utf-8', newline='')):
        if not r or not r[0].isdigit(): continue
        f = r[6].replace('\\', '/')
        funcs.setdefault(f, []).append((int(r[0]), int(r[1]), int(r[9]), int(r[10])))
    rows = []
    for f in sorted(funcs.keys() | set()):
        pass
    files = []
    for base, _, names in os.walk(root):
        for n in names:
            if n.endswith(('.ts', '.tsx')):
                files.append(os.path.join(base, n))
    for p in sorted(files):
        rel = os.path.relpath(p, root).replace('\\', '/')
        fk = next((k for k in funcs if k.replace('\\','/').endswith(rel)), None)
        for name, s, e in classes_in(p):
            fs = [x for x in funcs.get(fk, []) if x[2] >= s and x[3] <= e] if fk else []
            rows.append([name, rel, s, e, e - s + 1, sum(x[0] for x in fs), sum(x[1] for x in fs), max([x[1] for x in fs], default=0), len(fs)])
    with open(outcsv, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh, quoting=csv.QUOTE_ALL)
        w.writerow(['Class','File','StartLine','EndLine','LOC','MethodNLOC','TotalCCN','MaxCCN','FunctionCount'])
        w.writerows(rows)
    return rows
if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2], sys.argv[3])

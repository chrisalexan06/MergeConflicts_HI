Phase 4 Final Measurement
Tool: Lizard
Version: 1.26.1

Git tag: phase4
Git commit: 65e8ac4f7cffc4bfcf8e60fa4ef1145714dc3905

Language: TypeScript

Directories analyzed:
my-app/server/src
my-app/client/src

Included:
Production TypeScript source files
TypeScript test files

Excluded:
node_modules
Build output directories

Lizard options:
-l typescript -V
--csv for CSV output

Commands:
python3 -m lizard -l typescript --csv my-app/server/src my-app/client/src > lizard-raw.csv
python3 -m lizard -l typescript my-app/server/src my-app/client/src > lizard-report.txt
python3 ../tools/class_metrics.py <export-root> lizard-raw.csv class-metrics.csv

Notes:
- class-metrics.csv uses the same definitions as phase3: LOC = EndLine - StartLine + 1 of the class declaration; MethodNLOC, TotalCCN, MaxCCN and FunctionCount aggregate the Lizard functions located inside the class

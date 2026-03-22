import ast
import sys

from app.schemas.analysis import (
    AnalysisResponse, ImportInfo, FunctionInfo, ClassInfo, CodeWarning
)

# Python stdlib modules (3.10+)
STDLIB_MODULES = set(sys.stdlib_module_names) if hasattr(sys, 'stdlib_module_names') else {
    "abc", "aifc", "argparse", "array", "ast", "asynchat", "asyncio", "asyncore",
    "atexit", "base64", "bdb", "binascii", "binhex", "bisect", "builtins",
    "bz2", "calendar", "cgi", "cgitb", "chunk", "cmath", "cmd", "code",
    "codecs", "codeop", "collections", "colorsys", "compileall", "concurrent",
    "configparser", "contextlib", "contextvars", "copy", "copyreg", "cProfile",
    "crypt", "csv", "ctypes", "curses", "dataclasses", "datetime", "dbm",
    "decimal", "difflib", "dis", "distutils", "doctest", "email", "encodings",
    "enum", "errno", "faulthandler", "fcntl", "filecmp", "fileinput", "fnmatch",
    "fractions", "ftplib", "functools", "gc", "getopt", "getpass", "gettext",
    "glob", "grp", "gzip", "hashlib", "heapq", "hmac", "html", "http",
    "idlelib", "imaplib", "imghdr", "imp", "importlib", "inspect", "io",
    "ipaddress", "itertools", "json", "keyword", "lib2to3", "linecache",
    "locale", "logging", "lzma", "mailbox", "mailcap", "marshal", "math",
    "mimetypes", "mmap", "modulefinder", "multiprocessing", "netrc", "nis",
    "nntplib", "numbers", "operator", "optparse", "os", "ossaudiodev",
    "pathlib", "pdb", "pickle", "pickletools", "pipes", "pkgutil", "platform",
    "plistlib", "poplib", "posix", "posixpath", "pprint", "profile", "pstats",
    "pty", "pwd", "py_compile", "pyclbr", "pydoc", "queue", "quopri",
    "random", "re", "readline", "reprlib", "resource", "rlcompleter", "runpy",
    "sched", "secrets", "select", "selectors", "shelve", "shlex", "shutil",
    "signal", "site", "smtpd", "smtplib", "sndhdr", "socket", "socketserver",
    "sqlite3", "ssl", "stat", "statistics", "string", "stringprep", "struct",
    "subprocess", "sunau", "symtable", "sys", "sysconfig", "syslog", "tabnanny",
    "tarfile", "telnetlib", "tempfile", "termios", "test", "textwrap", "threading",
    "time", "timeit", "tkinter", "token", "tokenize", "tomllib", "trace",
    "traceback", "tracemalloc", "tty", "turtle", "turtledemo", "types",
    "typing", "unicodedata", "unittest", "urllib", "uu", "uuid", "venv",
    "warnings", "wave", "weakref", "webbrowser", "winreg", "winsound",
    "wsgiref", "xdrlib", "xml", "xmlrpc", "zipapp", "zipfile", "zipimport", "zlib",
}


def analyze_code(code: str) -> AnalysisResponse:
    """Analyze Python code using AST parsing."""
    lines = code.split("\n")
    total_lines = len(lines)

    # Check syntax
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return AnalysisResponse(
            is_valid=False,
            imports=[],
            functions=[],
            classes=[],
            warnings=[CodeWarning(line_number=e.lineno, message=f"Syntax error: {e.msg}", severity="error")],
            total_lines=total_lines,
            has_main_guard=False,
            syntax_error=str(e),
        )

    imports = []
    functions = []
    classes = []
    warnings = []
    has_main_guard = False

    for node in ast.walk(tree):
        # Imports
        if isinstance(node, ast.Import):
            for alias in node.names:
                module_root = alias.name.split(".")[0]
                imports.append(ImportInfo(
                    module=alias.name,
                    alias=alias.asname,
                    is_stdlib=module_root in STDLIB_MODULES,
                    is_third_party=module_root not in STDLIB_MODULES,
                ))

        elif isinstance(node, ast.ImportFrom):
            if node.module:
                module_root = node.module.split(".")[0]
                names = [a.name for a in node.names]
                imports.append(ImportInfo(
                    module=node.module,
                    is_stdlib=module_root in STDLIB_MODULES,
                    is_third_party=module_root not in STDLIB_MODULES,
                    names=names,
                ))

        # Functions
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            args = [a.arg for a in node.args.args]
            docstring = ast.get_docstring(node)
            functions.append(FunctionInfo(
                name=node.name,
                line_number=node.lineno,
                args=args,
                docstring=docstring,
                is_async=isinstance(node, ast.AsyncFunctionDef),
            ))

        # Classes
        elif isinstance(node, ast.ClassDef):
            bases = []
            for base in node.bases:
                if isinstance(base, ast.Name):
                    bases.append(base.id)
                elif isinstance(base, ast.Attribute):
                    bases.append(ast.dump(base))
            methods = [
                n.name for n in node.body
                if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
            ]
            docstring = ast.get_docstring(node)
            classes.append(ClassInfo(
                name=node.name,
                line_number=node.lineno,
                bases=bases,
                methods=methods,
                docstring=docstring,
            ))

        # Main guard check
        elif isinstance(node, ast.If):
            if (isinstance(node.test, ast.Compare) and
                isinstance(node.test.left, ast.Name) and
                node.test.left.id == "__name__"):
                has_main_guard = True

    # Warnings
    for node in ast.walk(tree):
        if isinstance(node, ast.ExceptHandler) and node.type is None:
            warnings.append(CodeWarning(
                line_number=node.lineno,
                message="Bare 'except' clause - consider catching specific exceptions",
                severity="warning",
            ))

    if not has_main_guard and any(
        isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) for n in ast.iter_child_nodes(tree)
    ):
        if any(isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) for n in ast.iter_child_nodes(tree)):
            warnings.append(CodeWarning(
                message="No 'if __name__ == \"__main__\"' guard found - code may run on import",
                severity="info",
            ))

    third_party = [i for i in imports if i.is_third_party]
    if third_party:
        warnings.append(CodeWarning(
            message=f"Third-party dependencies detected: {', '.join(i.module for i in third_party)}",
            severity="info",
        ))

    return AnalysisResponse(
        is_valid=True,
        imports=imports,
        functions=functions,
        classes=classes,
        warnings=warnings,
        total_lines=total_lines,
        has_main_guard=has_main_guard,
    )

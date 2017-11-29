const fs = require('fs');
const path = require('path');
const prettyBytes = require('pretty-bytes');
const chalk = require('chalk');
const Table = require('cli-table');

const DEFAULT_FILES = [
    "Makefile",
    "Gulpfile.js",
    "Gruntfile.js",
    ".DS_Store",
    ".tern-project",
    ".gitattributes",
    ".editorconfig",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintignore",
    ".npmignore",
    ".jshintrc",
    ".flowconfig",
    ".documentup.json",
    ".yarn-metadata.json",
    ".travis.yml",
    "appveyor.yml",
    "circle.yml",
    ".coveralls.yml",
    "CHANGES",
    "LICENSE.txt",
    "LICENSE",
    "AUTHORS",
    "CONTRIBUTORS",
    ".yarn-integrity",
    ".yarnclean",
];

const DEFAULT_DIRS = [
    "__tests__",
    "test",
    "tests",
    "powered-test",
    "docs",
    "doc",
    ".idea",
    ".vscode",
    "website",
    "images",
    "assets",
    "example",
    "examples",
    "coverage",
    ".nyc_output",
    ".circleci",
    ".github",
];

const DEFAULT_EXTS = [
    ".md",
    ".ts",
    ".jst",
    ".jsx",
    ".coffee",
    ".tgz",
    ".swp",
];

const isDefaultExt = (filepath) => DEFAULT_EXTS.indexOf(path.extname(filepath)) >= 0;
const isDefaultDir = (dirpath) => DEFAULT_DIRS.indexOf(path.basename(dirpath)) >= 0;
const isDefaultFile = (filepath) => DEFAULT_FILES.indexOf(path.basename(filepath)) >= 0;

function flatten(lists) {
    return lists.reduce(function (a, b) {
        return a.concat(b);
    }, []);
}

const dirSizes = {};

function readSizeRecursive(item) {
    if (dirSizes[item]) return dirSizes[item];

    const stats = fs.lstatSync(item);
    let total = 0;

    if (stats.isDirectory()) {
        total += stats.size;

        fs.readdirSync(item).forEach((diriten) => {
            total += readSizeRecursive(path.join(item, diriten))
        });
    }

    dirSizes[item] = total;

    return dirSizes[item];
}

function getDirectories(fileNode) {
    return fs.readdirSync(fileNode.path)
        .map(file => path.join(fileNode.path, file))
        .map(filepath => {
            const stat = fs.statSync(filepath);
            const fileNode = {
                isDir: stat.isDirectory(),
                isFile: stat.isFile(),
                path: filepath,
                size: stat.size,
                getSize() {
                    return this.isDir ? readSizeRecursive(this.path) : this.size
                }
            };

            if (fileNode.isDir || fileNode.isFile) {
                return fileNode
            }

            return null
        })
        .filter((n) => !!n)
}

function getDirectoriesRecursive(fileNode) {
    const files = flatten(
        getDirectories(fileNode)
            .map((fileNode) => fileNode.isDir ? getDirectoriesRecursive(fileNode) : fileNode)
    );

    return [fileNode, ...files];
}

function getFiles(src) {
    return getDirectoriesRecursive({path: src});
}

const prunedDirs = [];

const isFileAlreadyPruned = (filepath) => {
    return prunedDirs.find((src) => filepath.startsWith(src))
};

const addPrunedDir = (path) => {
    prunedDirs.push(path);
};

const isPathToPrune = (fileNode) => {
    if (fileNode.isDir && fileNode.path) {
        const status = isDefaultDir(fileNode.path);

        status && addPrunedDir(fileNode.path);

        return status
    }

    if (fileNode.isFile && fileNode.path && !isFileAlreadyPruned(fileNode.path)) {
        return isDefaultFile(fileNode.path)
    }

    return fileNode.path && isDefaultExt(fileNode.path)
};

const getSizeFromLogStats = (logStats) => {
    return logStats.reduce((a, b) => a + b.getSize(), 0)
};

const getDirsFromLogStats = (logStats) => {
    return logStats.reduce((a, b) => a + (b.isDir ? 1 : 0), 0)
};

const getFilesFromLogStats = (logStats) => {
    return logStats.reduce((a, b) => a + (b.isFile ? 1 : 0), 0)
};

const NODE_MODULES = "./node_modules";

const table = new Table({
    head: ['Module', 'Bytes pruned', 'dirs pruned', 'files pruned'],
    chars: {
        'top': '', 'top-mid': '', 'top-left': '', 'top-right': ''
        , 'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': ''
        , 'left': '', 'left-mid': '', 'mid': '', 'mid-mid': ''
        , 'right': '', 'right-mid': '', 'middle': ''
    }
});

const SIZE_3_KB = 3000;
const SIZE_10_KB = 10000;

const displayStats = (group, logStats) => {
    const size = getSizeFromLogStats(logStats);
    const bytes = prettyBytes(size);
    const dirs = getDirsFromLogStats(logStats);
    const files = getFilesFromLogStats(logStats);
    let bytesText = chalk.green(bytes);

    if (size > SIZE_3_KB) {
        bytesText = chalk.yellow(bytes);
    }

    if (size > SIZE_10_KB) {
        bytesText = chalk.red(bytes);
    }

    if (size > 0) {
        table.push(
            [group, bytesText, dirs > 0 ? chalk.blue(dirs) : '', files > 0 ? chalk.blue(files) : '']
        );
    }
};

module.exports = function scan() {
    fs.readdir(NODE_MODULES, (err, files) => {
        const totalStats = [];

        files.forEach((dirname) => {
            const logStats = [];
            const filepath = path.join(NODE_MODULES, dirname);
            const stat = fs.statSync(filepath);

            stat.isDirectory() && getFiles(filepath).forEach(fileNode => {
                if (isPathToPrune(fileNode)) {
                    logStats.push(fileNode);
                    totalStats.push(fileNode);
                }
            });

            displayStats(dirname, logStats);
        });

        table.push(
            ['', '', '', ''],
            ['', '', '', '']
        );
        displayStats("Total", totalStats);

        console.log(table.toString());
    });
}



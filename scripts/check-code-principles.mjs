#!/usr/bin/env node
// Enforce structural rules from CODE_PRINCIPLES.md.
// Rule 20's semantic grouping still needs human review.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

class CodePrinciplesChecker {
  static DIRECTORIES = ['server/src', 'server/test', 'scripts'];
  static EXTENSIONS = new Set(['.ts', '.tsx', '.mjs']);

  static async listFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.listFiles(fullPath));
        continue;
      }

      if (this.EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }

    return files;
  }

  static addIssue(sourceFile, node, issues, message) {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push(`${sourceFile.fileName}:${location.line + 1}: ${message}`);
  }

  static checkControlBody(sourceFile, statement, issues) {
    if (!ts.isBlock(statement)) {
      this.addIssue(sourceFile, statement, issues, 'Control flow must use braces (Rule 14).');
      return;
    }

    const opening = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line;
    const closing = sourceFile.getLineAndCharacterOfPosition(statement.getEnd() - 1).line;
    if (opening === closing) {
      this.addIssue(sourceFile, statement, issues, 'Do not compress a control block onto one line (Rule 14).');
    }
  }

  static checkCatch(sourceFile, clause, issues) {
    this.checkControlBody(sourceFile, clause.block, issues);

    if (clause.block.statements.length === 0) {
      this.addIssue(sourceFile, clause, issues, 'Empty catch block silently suppresses errors (Rule 12).');
    }
  }

  static checkNode(sourceFile, node, issues) {
    if (ts.isIfStatement(node)) {
      this.checkControlBody(sourceFile, node.thenStatement, issues);
      if (node.elseStatement && !ts.isIfStatement(node.elseStatement)) {
        this.checkControlBody(sourceFile, node.elseStatement, issues);
      }
    } else if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    ) {
      this.checkControlBody(sourceFile, node.statement, issues);
    } else if (ts.isTryStatement(node)) {
      this.checkControlBody(sourceFile, node.tryBlock, issues);

      if (node.catchClause) {
        this.checkCatch(sourceFile, node.catchClause, issues);
      }

      if (node.finallyBlock) {
        this.checkControlBody(sourceFile, node.finallyBlock, issues);
      }
    }

    ts.forEachChild(node, (child) => this.checkNode(sourceFile, child, issues));
  }

  static async run() {
    const files = (await Promise.all(this.DIRECTORIES.map((dir) => this.listFiles(dir)))).flat();
    const issues = [];

    for (const file of files) {
      const text = await readFile(file, 'utf8');
      const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);

      this.checkNode(sourceFile, sourceFile, issues);
    }

    if (issues.length > 0) {
      throw new Error('CODE_PRINCIPLES violations:\n' + issues.join('\n'));
    }

    console.log('Checked ' + files.length + ' files: no compressed control blocks or empty catch handlers.');
  }
}

await CodePrinciplesChecker.run();

package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"

	. "github.com/shurcooL/go/gists/gist5286084"
	. "github.com/shurcooL/go/gists/gist5504644"
	. "github.com/shurcooL/go/gists/gist5639599"
)

const parserMode = parser.ParseComments
const astMergeMode = 0*ast.FilterFuncDuplicates | ast.FilterUnassociatedComments | ast.FilterImportDuplicates

func main() {
	bpkg, err := BuildPackageFromImportPath("gist.github.com/7176504.git")
	CheckError(err)

	filenames := append(bpkg.GoFiles, bpkg.CgoFiles...)
	files := make(map[string]*ast.File, len(filenames))
	fset := token.NewFileSet()
	for _, filename := range filenames {
		fileAst, err := parser.ParseFile(fset, filepath.Join(bpkg.Dir, filename), nil, parserMode)
		CheckError(err)
		files[filename] = fileAst // TODO: Figure out if filename or full path are to be used (the key of this map doesn't seem to be used anywhere!)
	}
	{
		fileAst, err := parser.ParseFile(fset, "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5892738.git/main.go", nil, parserMode)
		CheckError(err)
		files["5892738"] = fileAst
	}
	apkg := &ast.Package{Name: bpkg.Name, Files: files}

	merged := ast.MergePackageFiles(apkg, astMergeMode)

	println("package " + SprintAst(fset, merged.Name))
	println()
	println(`import (`)
	for _, i := range merged.Imports {
		println("\t" + SprintAst(fset, i))
	}
	println(`)`)
	println()
	//PrintlnAst(fset, merged)

	for _, i := range merged.Decls {
		if x, ok := i.(*ast.GenDecl); ok && x.Tok == token.IMPORT {
			continue
		}

		PrintlnAst(fset, i)
		println()
	}

	//goon.Dump(merged)
}

package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strings"
	"code.google.com/p/go.tools/go/types"
	"code.google.com/p/go.tools/importer"
	importer2 "honnef.co/go/importer"

	. "gist.github.com/5286084.git"
	. "gist.github.com/5504644.git"
	. "gist.github.com/5639599.git"
)

var _ = AstPackageFromBuildPackage
var _ = PrintlnAst

const parserMode = parser.ParseComments
const astMergeMode = 0*ast.FilterFuncDuplicates | ast.FilterUnassociatedComments | ast.FilterImportDuplicates

var imports map[string]*importer.PackageInfo
var dotImports []*importer.PackageInfo

func findDotImports(pi *importer.PackageInfo) {
	for _, file := range pi.Files {
		for _, importSpec := range file.Imports {
			if importSpec.Name != nil && importSpec.Name.Name == "." {
				importPath := strings.Trim(importSpec.Path.Value, `"`)
				dotImports = append(dotImports, imports[importPath])
				findDotImports(imports[importPath])
			}
		}
	}
}

func main() {
	imp2 := importer2.New()
	imp2.Config.UseGcFallback = true
	cfg := types.Config{Import: imp2.Import}
	_ = cfg

	imp := importer.New(&importer.Config{
		//TypeChecker:   cfg,
		SourceImports: true,
	})

	//pi, err := imp.ImportPackage("gist.github.com/7176504.git")
	pi, err := imp.ImportPackage("github.com/shurcooL/goe")
	CheckError(err)
	_ = pi

	// Create ImportPath -> *PackageInfo map
	imports = make(map[string]*importer.PackageInfo, len(imp.AllPackages()))
	for _, pi := range imp.AllPackages() {
		imports[pi.Pkg.Path()] = pi
	}

	findDotImports(pi)

	files := make(map[string]*ast.File)
	{
		// This package
		for _, file := range pi.Files {
			filename := imp.Fset.File(file.Package).Name()
			files[filename] = file
		}

		// All dot imports
		for _, pi := range dotImports {
			for _, file := range pi.Files {
				filename := imp.Fset.File(file.Package).Name()
				files[filename] = file
			}
		}
	}

	apkg := &ast.Package{Name: pi.Pkg.Name(), Files: files}

	merged := ast.MergePackageFiles(apkg, astMergeMode)

	println("package " + SprintAst(imp.Fset, merged.Name))
	println()
	println(`import (`)
	for _, importSpec := range merged.Imports {
		if importSpec.Name != nil && importSpec.Name.Name == "." {
			continue
		}
		println("\t" + SprintAst(imp.Fset, importSpec))
	}
	println(`)`)
	println()
	//PrintlnAst(imp.Fset, merged)

	for _, decl := range merged.Decls {
		if x, ok := decl.(*ast.GenDecl); ok && x.Tok == token.IMPORT {
			continue
		}

		PrintlnAst(imp.Fset, decl)
		println()
	}

	// TODO: Make this work equivalent to above
	//PrintlnAst(imp.Fset, merged)

	//goon.Dump(merged)
}

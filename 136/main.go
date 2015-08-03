package main

import (
	"fmt"
	"go/ast"
	"go/token"
	"time"

	"github.com/davecgh/go-spew/spew"
	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/go/gists/gist5504644"
	"golang.org/x/tools/go/types"
	"golang.org/x/tools/go/types/typeutil"
	importer2 "honnef.co/go/importer"
)

//. "github.com/shurcooL/go/gists/gist5639599"

func main() {
	spew.Config.Indent = "\t"
	spew.Config.ContinueOnMethod = true
	spew.Config.MaxDepth = 3

	ImportPath := "github.com/goxjs/glfw"

	bpkg, err := gist5504644.BuildPackageFromImportPath(ImportPath)
	//dpkg := GetDocPackage(BuildPackageFromImportPath(ImportPath)) // Shouldn't reuse bpkg because doc.Package "takes ownership of the *ast.Package and may edit or overwrite it"...
	dpkg, err := gist5504644.GetDocPackage(bpkg, err)
	if err != nil {
		panic(err)
	}
	_ = dpkg

	fset := token.NewFileSet()
	files, err := gist5504644.ParseFiles(fset, bpkg.Dir, append(bpkg.GoFiles, bpkg.CgoFiles...)...)
	if err != nil {
		panic(err)
	}

	imp := importer2.New()
	imp.Config.UseGcFallback = true

	cfg := &types.Config{
		//Import: types.GcImport,
		Import: imp.Import,
	}
	started := time.Now()
	info := &types.Info{
		Types:      make(map[ast.Expr]types.TypeAndValue),
		Defs:       make(map[*ast.Ident]types.Object),
		Uses:       make(map[*ast.Ident]types.Object),
		Implicits:  make(map[ast.Node]types.Object),
		Selections: make(map[*ast.SelectorExpr]*types.Selection),
		Scopes:     make(map[ast.Node]*types.Scope),
	}
	tpkg, err := cfg.Check(ImportPath, fset, files, info)
	if err != nil {
		panic(err)
	}
	_ = tpkg
	goon.DumpExpr(time.Since(started).Seconds())

	goon.DumpExpr(len(info.Types))
	goon.DumpExpr(len(info.Defs))
	goon.DumpExpr(len(info.Uses))
	goon.DumpExpr(len(info.Implicits))
	goon.DumpExpr(len(info.Selections))
	goon.DumpExpr(len(info.Scopes))

	/*println()
	for _, n := range tpkg.Scope().Names() {
		obj := tpkg.Scope().Lookup(n)
		fmt.Print(obj.Name())
		//fmt.Printf("%s: %s", obj.Name(), gist7576804.TypeChainString(obj.Type()))
		//if constObj, ok := obj.(*types.Const); ok {
		//	fmt.Printf(" = %v", constObj.Val())
		//}
		fmt.Println()
	}*/

	println()
	window := tpkg.Scope().Lookup("Window")
	fmt.Println(window.String())
	for _, sel := range typeutil.IntuitiveMethodSet(window.Type(), nil) {
		method := sel.Obj().(*types.Func)
		//fmt.Println(types.SelectionString(sel, nil))
		fmt.Println(method.String())
	}

	//return
	/*println()
	for _, t := range dpkg.Types {
		_ = t
		//PrintlnAstBare(t.Decl)
		//if types.Implements(types.NewPointer(tpkg.Scope().Lookup(t.Name).Type()), widgeterInterface) {
		//	fmt.Println("> *" + t.Name)
		//} else {
		fmt.Println("  *" + t.Name)
		//}
		//method, wrongType := types.MissingMethod(tpkg.Scope().Lookup(t.Name).Type(), widgeterInterface, false)
		//if method != nil { goon.Dump(method.String(), wrongType) }
		//goon.Dump(t)
		//return
	}*/
}

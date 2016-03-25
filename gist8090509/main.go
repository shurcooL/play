// Play with go/types package, list all types in Conception-go that implement Widgeter interface.
package main

import (
	"fmt"
	"go/doc"
	"go/format"
	"go/token"
	"time"

	"github.com/davecgh/go-spew/spew"
	"github.com/shurcooL/go-goon"
	. "github.com/shurcooL/go/gists/gist5504644"
	. "github.com/shurcooL/go/gists/gist5639599"
	"golang.org/x/tools/go/types"

	//. "github.com/shurcooL/Conception-go"

	"go/ast"

	importer2 "honnef.co/go/importer"
)

var _ = fmt.Errorf
var _ = doc.Examples
var _ = PrintlnAstBare
var _ = goon.Dump
var _ = format.Source
var _ = time.After

func main() {
	spew.Config.Indent = "\t"
	spew.Config.ContinueOnMethod = true
	spew.Config.MaxDepth = 3

	// TODO: Consider using code.google.com/p/go.tools/go/loader
	ImportPath := "github.com/shurcooL/Conception-go"

	bpkg, err := BuildPackageFromImportPath(ImportPath)
	//dpkg := GetDocPackage(BuildPackageFromImportPath(ImportPath)) // Shouldn't reuse bpkg because doc.Package "takes ownership of the *ast.Package and may edit or overwrite it"...
	dpkg, err := GetDocPackage(bpkg, err)
	if err != nil {
		panic(err)
	}

	fset := token.NewFileSet()
	files, err := ParseFiles(fset, bpkg.Dir, append(bpkg.GoFiles, bpkg.CgoFiles...)...)
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
	goon.DumpExpr(time.Since(started).Seconds())

	goon.DumpExpr(len(info.Types))
	goon.DumpExpr(len(info.Defs))
	goon.DumpExpr(len(info.Uses))
	goon.DumpExpr(len(info.Implicits))
	goon.DumpExpr(len(info.Selections))
	goon.DumpExpr(len(info.Scopes))

	//goon.Dump(tpkg.Scope().Names())
	widgeterInterface := tpkg.Scope().Lookup("Widgeter").Type().Underlying().(*types.Interface)
	//fmt.Println(format.Source([]byte(widgeterInterface.String())))
	fmt.Println(widgeterInterface.String())
	fmt.Println()

	spew.Dump(types.NewPointer(tpkg.Scope().Lookup("Widget").Type()))
	//return

	method, wrongType := types.MissingMethod(types.NewPointer(tpkg.Scope().Lookup("Widget").Type()), widgeterInterface, false)
	if method != nil {
		goon.Dump(method.String(), wrongType)
	}

	{
		println()
		typVal, err := types.Eval(fset, tpkg, token.NoPos, "Shunpo")
		if err != nil {
			panic(err)
		}
		fmt.Printf(`types.Eval("Shunpo"): %+v`, typVal)
		fmt.Println()
	}

	println()
	for _, n := range tpkg.Scope().Names() {
		obj := tpkg.Scope().Lookup(n)
		fmt.Printf("%s: %s", obj.Name(), typeChainString(obj.Type()))
		if constObj, ok := obj.(*types.Const); ok {
			fmt.Printf(" = %v", constObj.Val())
		}
		fmt.Println()
	}

	//return
	println()
	for _, t := range dpkg.Types {
		_ = t
		//PrintlnAstBare(t.Decl)
		if types.Implements(types.NewPointer(tpkg.Scope().Lookup(t.Name).Type()), widgeterInterface) {
			fmt.Println("> *" + t.Name)
		} else {
			fmt.Println("  *" + t.Name)
		}
		//method, wrongType := types.MissingMethod(tpkg.Scope().Lookup(t.Name).Type(), widgeterInterface, false)
		//if method != nil { goon.Dump(method.String(), wrongType) }
		//goon.Dump(t)
		//return
	}
}

// typeChainString returns the full type chain as a string.
func typeChainString(t types.Type) string {
	out := fmt.Sprintf("%s", t)
	for {
		if t == t.Underlying() {
			break
		} else {
			t = t.Underlying()
		}
		out += fmt.Sprintf(" -> %s", t)
	}
	return out
}

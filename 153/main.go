// Play with implementing goon dumper using go/ast and go/printer.
package main

import (
	"fmt"
	"go/ast"
	"go/printer"
	"go/token"
	"os"
	"reflect"
	"strconv"

	"github.com/shurcooL/go-goon"
)

func main() {
	for _, Dump := range []func(interface{}){
		GoonDump,
		Dump,
	} {
		Dump(123)

		Dump("Hello.")

		type Inner struct {
			Field1 string
			Field2 int
		}
		type Lang struct {
			Name    string
			Year    int32
			URL     string
			Inner   *Inner
			Pointer *string
		}

		x := Lang{
			Name: "Go",
			Year: 2009,
			URL:  "http",
			Inner: &Inner{
				Field1: "Secret!",
			},
		}
		Dump(x)
	}
}

func GoonDump(v interface{}) {
	goon.Dump(v)
}

// Consistent with the default gofmt behavior.
var config = printer.Config{Mode: printer.UseSpaces | printer.TabIndent, Tabwidth: 8}

func Dump(v interface{}) {
	expr := dump(reflect.ValueOf(v))
	const size = 1000
	fset := token.NewFileSet()
	f := fset.AddFile("", -1, size)
	for i := 0; i < size; i++ {
		f.AddLine(i)
	}
	config.Fprint(os.Stdout, fset, expr)
	os.Stdout.WriteString("\n")
}

// typeValue creates an expression of the form:
//
// 	(type)(value)
func typeValue(typ, value ast.Expr) ast.Expr {
	return &ast.CallExpr{
		Fun: &ast.ParenExpr{
			X: typ,
		},
		Args: []ast.Expr{
			value,
		},
	}
}

func dump(v reflect.Value) ast.Expr {
	vt := v.Type()
	switch v.Kind() {
	case reflect.Bool:
		return typeValue(
			&ast.Ident{Name: vt.String()},
			&ast.BasicLit{Value: strconv.FormatBool(v.Bool())},
		)
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return typeValue(
			&ast.Ident{Name: vt.String()},
			&ast.BasicLit{Value: strconv.FormatInt(v.Int(), 10)},
		)
	case reflect.String:
		return typeValue(
			&ast.Ident{Name: vt.String()},
			&ast.BasicLit{Value: strconv.Quote(v.String())},
		)
	case reflect.Struct:
		var fields []ast.Expr
		for i := 0; i < vt.NumField(); i++ {
			fields = append(fields, &ast.KeyValueExpr{
				Key: &ast.Ident{
					Name: vt.Field(i).Name,
					//NamePos: token.Pos(1 + i + 1),
				},
				Value: dump(v.Field(i)),
			})
		}
		typ := &ast.Ident{Name: vt.Name()}
		return typeValue(
			typ,
			&ast.CompositeLit{
				Type: typ,
				Elts: fields,
				//Lbrace: token.Pos(1),
				//Rbrace: token.Pos(1 + len(fields) + 1),
			},
		)
	case reflect.Ptr:
		// TODO: Keep track of visited pointers to avoid infinite loop.
		if v.IsNil() {
			return typeValue(
				&ast.StarExpr{X: &ast.Ident{Name: vt.Elem().Name()}},
				&ast.BasicLit{Value: "nil"},
			)
		}
		tv := dump(v.Elem()).(*ast.CallExpr)
		typ, value := tv.Fun.(*ast.ParenExpr).X, tv.Args[0]
		return typeValue(
			&ast.StarExpr{X: typ},
			&ast.UnaryExpr{
				Op: token.AND,
				X:  value,
			},
		)
	default:
		panic(fmt.Errorf("unsupported kind: %v", v.Kind()))
	}
}

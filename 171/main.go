package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strconv"

	"github.com/gopherjs/gopherjs/js"
	"github.com/shurcooL/go/gopherjs_http/jsutil"
	"github.com/shurcooL/go/u/u9"
	"github.com/shurcooL/htmlg"
	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

var source *dom.HTMLTextAreaElement
var highlighted dom.HTMLElement
var elements dom.HTMLElement

var _, initial = `package main

import (
	"flag"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"

	"golang.org/x/net/webdav"
)

var storageDirFlag = flag.String("storage-dir", "", "Storage dir for snippets; if empty, a volatile in-memory store is used.")
var httpFlag = flag.String("http", ":8080", "Listen for HTTP connections on this address.")
var allowOriginFlag = flag.String("allow-origin", "http://www.gopherjs.org", "Access-Control-Allow-Origin header value.")

const maxSnippetSizeBytes = 1024 * 1024

func pHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", *allowOriginFlag)

	if req.Method != "GET" {
		w.Header().Set("Allow", "GET")
		http.Error(w, "Method should be GET.", http.StatusMethodNotAllowed)
		return
	}

	id := req.URL.Path[len("/p/"):]
	err := validateID(id)
	if err != nil {
		http.Error(w, "Unexpected id format.", http.StatusBadRequest)
		return
	}

	var snippet io.Reader
	if rc, err := getSnippetFromLocalStore(id); err == nil { // Check if we have the snippet locally first.
		defer rc.Close()
		snippet = rc
	} else if rc, err = getSnippetFromGoPlayground(id); err == nil { // If not found locally, try the Go Playground.
		defer rc.Close()
		snippet = rc
	}

	if snippet == nil {
		// Snippet not found.
		http.Error(w, "Snippet not found.", http.StatusNotFound)
		return
	}

	_, err = io.Copy(w, snippet)
	if err != nil {
		log.Println(err)
		http.Error(w, "Server error.", http.StatusInternalServerError)
		return
	}
}

func main() {
	flag.Parse()
}
`, `package main

func Foo() string {
	return "Hi."
}

func main() {
	if 5 == 2+3 {
		fmt.Println(Foo())
	}
}
`

func run(_ dom.Event) {
	fset := token.NewFileSet()
	fileAST, err := parser.ParseFile(fset, "", source.Value, parser.ParseComments|parser.AllErrors)
	if err != nil {
		elements.SetTextContent(err.Error())
		return
	}

	highlighted.SetTextContent(source.Value)

	v := NewVisitor()
	ast.Walk(v, fileAST)
	nodes := visit(v.Root.Children[0])
	elements.SetInnerHTML(string(htmlg.Render(nodes...)))
}

func setup() {
	source = document.GetElementByID("source").(*dom.HTMLTextAreaElement)
	highlighted = document.GetElementByID("highlighted").(dom.HTMLElement)
	elements = document.GetElementByID("elements").(dom.HTMLElement)

	u9.AddTabSupport(source)

	source.AddEventListener("input", false, run)
	source.Value = initial
	//source.SelectionStart, source.SelectionEnd = len(initial), len(initial)
	//source.SelectionStart, source.SelectionEnd = 0, 0
	run(nil)
}

func MouseOver(this dom.HTMLElement) {
	div := this.(*dom.HTMLDivElement)
	pos, _ := strconv.Atoi(div.GetAttribute("data-pos"))
	end, _ := strconv.Atoi(div.GetAttribute("data-end"))
	highlighted.SetInnerHTML(string(htmlg.Render(
		htmlg.Text(source.Value[:pos]),
		htmlg.SpanClass("h", htmlg.Text(source.Value[pos:end])),
		htmlg.Text(source.Value[end:]),
	)))
}

func MouseOut() {
	highlighted.SetTextContent(source.Value)
}

func main() {
	js.Global.Set("MouseOver", jsutil.Wrap(MouseOver))
	js.Global.Set("MouseOut", MouseOut)

	document.AddEventListener("DOMContentLoaded", false, func(dom.Event) { setup() })
}

/*func run(_ dom.Event) {
	fset := token.NewFileSet()
	fileAST, err := parser.ParseFile(fset, "", source.Value, parser.ParseComments|parser.AllErrors)
	if err != nil {
		elements.SetTextContent(err.Error())
		return
	}

	ast.Walk(&visitor{}, fileAST)

	var nodes []*html.Node
	for i := 1; i <= 5; i++ {
		n := htmlg.DivClass("node", htmlg.Text(fmt.Sprintf("line %v", i)))
		nodes = append(nodes, n)
	}
	elements.SetInnerHTML(string(htmlg.Render(nodes...)))
}

func run(_ dom.Event) {
	fset := token.NewFileSet()
	fileAST, err := parser.ParseFile(fset, "", source.Value, parser.ParseComments|parser.AllErrors)
	if err != nil {
		elements.SetTextContent(err.Error())
		return
	}

	var buf bytes.Buffer
	err = ast.Fprint(&buf, fset, fileAST, nil)
	if err != nil {
		panic(err)
	}
	elements.SetTextContent(buf.String())
}*/

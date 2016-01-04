package main

import (
	"go/ast"
	"go/parser"
	"go/token"

	"github.com/shurcooL/go/u/u9"
	"github.com/shurcooL/htmlg"
	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

var source *dom.HTMLTextAreaElement
var elements dom.HTMLElement

var initial = `package main

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
`

func run(_ dom.Event) {
	fset := token.NewFileSet()
	fileAST, err := parser.ParseFile(fset, "", source.Value, parser.ParseComments|parser.AllErrors)
	if err != nil {
		elements.SetTextContent(err.Error())
		return
	}

	v := &visitor{}
	ast.Walk(v, fileAST)
	elements.SetInnerHTML(string(htmlg.Render(v.nodes...)))
}

func setup() {
	source = document.GetElementByID("source").(*dom.HTMLTextAreaElement)
	elements = document.GetElementByID("elements").(dom.HTMLElement)

	u9.AddTabSupport(source)

	source.AddEventListener("input", false, run)
	source.Value = initial
	//source.SelectionStart, source.SelectionEnd = len(initial), len(initial)
	//source.SelectionStart, source.SelectionEnd = 0, 0
	run(nil)
}

func main() {
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

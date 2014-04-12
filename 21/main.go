// Test Markdown parser with the debug renderer.
package main

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"os"
	"reflect"
	"runtime"
	"time"

	"github.com/shurcooL/blackfriday"
	"github.com/shurcooL/markdownfmt/markdown"
	"github.com/shurcooL/markdownfmt/markdown/debug"
)

var (
	dunno     = []byte("???")
	centerDot = []byte("·")
	dot       = []byte(".")
)

// function returns, if possible, the name of the function containing the PC.
func function(pc uintptr) []byte {
	fn := runtime.FuncForPC(pc)
	if fn == nil {
		return dunno
	}
	name := []byte(fn.Name())
	// The name includes the path name to the package, which is unnecessary
	// since the file name is already included.  Plus, it has center dots.
	// That is, we see
	//      runtime/debug.*T·ptrmethod
	// and want
	//      *T.ptrmethod
	if period := bytes.LastIndex(name, []byte("/")); period >= 0 {
		name = name[period+1:]
	}
	/*if period := bytes.Index(name, dot); period >= 0 {
		name = name[period+1:]
	}*/
	name = bytes.Replace(name, centerDot, dot, -1)
	return name
}

func main() {
	go func() {
		time.Sleep(time.Second)
		os.Exit(1)
	}()

	input, err := ioutil.ReadAll(os.Stdin)
	if err != nil {
		panic(err)
	}

	if false {
		v := reflect.ValueOf(debug.NewRenderer().NormalText)
		if v.IsNil() {
			panic("")
		}
		pc := v.Pointer()
		println(string(function(pc)))
	}
	if false {
		v := reflect.ValueOf(debug.NewRenderer)
		if v.IsNil() {
			panic("")
		}
		pc := v.Pointer()
		println(string(function(pc)))
	}

	// GitHub Flavored Markdown-like extensions.
	extensions := 0
	extensions |= blackfriday.EXTENSION_NO_INTRA_EMPHASIS
	//extensions |= blackfriday.EXTENSION_TABLES // TODO: Implement.
	extensions |= blackfriday.EXTENSION_FENCED_CODE
	extensions |= blackfriday.EXTENSION_AUTOLINK
	extensions |= blackfriday.EXTENSION_STRIKETHROUGH
	extensions |= blackfriday.EXTENSION_SPACE_HEADERS
	//extensions |= blackfriday.EXTENSION_HARD_LINE_BREAK

	//output := blackfriday.MarkdownBasic(input)
	//output := blackfriday.Markdown(input, blackfriday.HtmlRenderer(0, "", ""), 0)
	output := blackfriday.Markdown(input, markdown.NewRenderer(), extensions)

	os.Stdout.Write(output)

	fmt.Println("-----")

	output = blackfriday.Markdown(input, debug.NewRenderer(), extensions)

	os.Stdout.Write(output)
}

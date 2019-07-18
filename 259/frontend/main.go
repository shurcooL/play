package main

import (
	"fmt"
	"runtime"
	"syscall/js"
	"testing"
	"time"

	"honnef.co/go/js/dom/v2"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	loaded := make(chan struct{})
	switch readyState := document.ReadyState(); readyState {
	case "loading":
		document.AddEventListener("DOMContentLoaded", false, func(dom.Event) { close(loaded) })
	case "interactive", "complete":
		close(loaded)
	default:
		panic(fmt.Errorf("internal error: unexpected document.ReadyState value: %v", readyState))
	}
	<-loaded

	for i := 0; i < 10000; i++ {
		div := document.CreateElement("div")
		div.SetInnerHTML(fmt.Sprintf("foo <strong>bar</strong> baz %d", i))
		document.Body().AppendChild(div)
	}

	time.Sleep(time.Second)

	runBench(BenchmarkGoSyscallJS, WasmOrGJS+" via syscall/js")
	if runtime.GOARCH == "js" { // GopherJS-only benchmark.
		runBench(BenchmarkGoGopherJS, "GopherJS via github.com/gopherjs/gopherjs/js")
	}
	runBench(BenchmarkNativeJavaScript, "native JavaScript")

	document.Body().Style().SetProperty("background-color", "lightgreen", "")
}

func runBench(f func(*testing.B), desc string) {
	r := testing.Benchmark(f)
	msPerOp := float64(r.T) * 1e-6 / float64(r.N)
	fmt.Printf("%f ms/op - %s\n", msPerOp, desc)
}

func BenchmarkGoSyscallJS(b *testing.B) {
	var total float64
	for i := 0; i < b.N; i++ {
		total = 0
		divs := js.Global().Get("document").Call("getElementsByTagName", "div")
		for j := 0; j < divs.Length(); j++ {
			total += divs.Index(j).Call("getBoundingClientRect").Get("top").Float()
		}
	}
	_ = total
}

func BenchmarkNativeJavaScript(b *testing.B) {
	js.Global().Set("NativeJavaScript", js.Global().Call("eval", nativeJavaScript))
	b.ResetTimer()
	js.Global().Get("NativeJavaScript").Invoke(b.N)
}

const nativeJavaScript = `(function(N) {
	var i, j, total;
	for (i = 0; i < N; i++) {
		total = 0;
		var divs = document.getElementsByTagName("div");
		for (j = 0; j < divs.length; j++) {
			total += divs[j].getBoundingClientRect().top;
		}
	}
	var _ = total;
})`

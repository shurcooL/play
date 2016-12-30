package main_test

import (
	"bytes"
	"context"
	"io"
	"io/ioutil"
	"testing"
)

func BenchmarkRenderBodyInnerHTML(b *testing.B) {
	/*{
		f, err := os.Create("cpu.out")
		if err != nil {
			b.Fatal(err)
		}
		pprof.StartCPUProfile(f)
		defer pprof.StopCPUProfile()
	}*/

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		err := FastestRenderBodyInnerHTMLInTheWorld(context.Background(), ioutil.Discard)
		if err != nil {
			b.Fatal(err)
		}
	}

	/* Output:
	$ go test -bench=. -benchmem
	BenchmarkRenderBodyInnerHTML-8   	200000000	         7.64 ns/op	       0 B/op	       0 allocs/op
	PASS
	ok  	github.com/shurcooL/play/215	2.293s
	*/
}

// 50 KB of pre-rendered bytes. It doesn't get faster than this, does it?
var lotsOfBytes = bytes.Repeat([]byte{'a'}, 50*1024)

func FastestRenderBodyInnerHTMLInTheWorld(_ context.Context, w io.Writer) error {
	n, err := w.Write(lotsOfBytes)
	if n != 50*1024 {
		panic("unexpected write amount")
	}
	return err
}

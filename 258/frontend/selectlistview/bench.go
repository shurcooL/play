package selectlistview

import (
	"fmt"
	"testing"
	"time"

	"honnef.co/go/js/dom/v2"
)

func bench(f func()) {
	time.Sleep(10 * time.Second)

	fmt.Println(testing.Benchmark(BenchmarkAppend))
	fmt.Println(testing.Benchmark(BenchmarkTwoLoops))
	fmt.Println(testing.Benchmark(func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			f()
		}
	}))
}

func BenchmarkAppend(b *testing.B) {
	for i := 0; i < b.N; i++ {
		var headers []dom.Element
		for _, header := range append(document.Body().GetElementsByTagName("h3"), document.Body().GetElementsByTagName("h4")...) {
			if header.ID() == "" {
				continue
			}
			headers = append(headers, header)
		}
		sink = headers
	}
}

func BenchmarkTwoLoops(b *testing.B) {
	for i := 0; i < b.N; i++ {
		var headers []dom.Element
		for _, h := range document.Body().GetElementsByTagName("h3") {
			if h.ID() == "" {
				continue
			}
			headers = append(headers, h)
		}
		for _, h := range document.Body().GetElementsByTagName("h4") {
			if h.ID() == "" {
				continue
			}
			headers = append(headers, h)
		}
		sink = headers
	}
}

var sink []dom.Element

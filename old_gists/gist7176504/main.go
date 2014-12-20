// Experiment with various things.
package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
	"time"

	"github.com/shurcooL/go/trim"
)

const Const = 1 + 1

type Bar struct {
	key   string
	value int
}

// This is a comment for foo func.
func foo(someN int, s1, s2 string) (int, string) {
	return 5, "hi"
}

func handler(w http.ResponseWriter, r *http.Request) {
	b, err := ioutil.ReadAll(r.Body)
	_, _ = b, err
	//_ = b
	//_ = err
}

func main() {
	ii := 1335
	xyz := "Go"
	foo(ii, strings.Join([]string{"some", "text"}, "-"), xyz)
	fmt.Println(trim.FirstSpace("  Booyah!!!!!!!!!!!!!!!!!!!!!!"))
	for i := 1; i <= 10 || false; i++ {
		time.Sleep(1000 * time.Millisecond)
		if i%3 != 0 {
			fmt.Println(i)
		} else {
			println(i, "stderr")
		}
	}
	i := Bar{"i", 1234}
	i.value++
}

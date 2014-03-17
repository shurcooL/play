package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"time"

	. "gist.github.com/5892738.git"
)

const Const = 1 + 1

type Bar struct {
	key   string
	value int
}

func foo() (int, string) { return 5, "hi" }

func handler(w http.ResponseWriter, r *http.Request) {
	b, err := ioutil.ReadAll(r.Body)
	_, _ = b, err
	//_ = b
	//_ = err
}

func main() {
	foo()
	fmt.Println(TrimFirstSpace("  Booyah!!!!!!!!!!!!!!"))
	for i := 1; i <= 10 || false; i++ {
		time.Sleep(1000 * time.Millisecond)
		if i%3 != 0 {
			fmt.Println(i)
		} else {
			println(i, "stderr")
		}
	}
	i := Bar{"i", 1236}
	i.value++
}

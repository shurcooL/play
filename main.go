package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"time"
)

const Const = 1 + 1

type Bar struct {
	key   string
	value int
}

func foo() (int, string) { return 5, "hi" }

func handler(w http.ResponseWriter, r *http.Request) {
	b, err := ioutil.ReadAll(r.Body)
	_ = b
	_ = err
}

func main() {
	foo()
	fmt.Println("Booyah!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
	for i := 1; i <= 10; i++ {
		time.Sleep(100 * time.Millisecond)
		fmt.Println(i)
	}
	i := Bar{"i", 1236}
	i.value++
}

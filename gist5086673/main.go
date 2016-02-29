// Count the total and unique number of words in a text, prints their frequencies.
package main

import (
	"fmt"
	"io/ioutil"
	"runtime"
	"strconv"
	"strings"

	"github.com/shurcooL/go/gists/gist5092053"
)

func main() {
	filepath := thisGoSourceFile()
	//filepath := "/Users/Dmitri/Dropbox/Work/2013/yelp/Yelp/Gen/5star_text.txt"

	Process(filepath)
}

func Process(filepath string) {
	b, err := ioutil.ReadFile(filepath)
	if err != nil {
		panic(err)
	}

	if true {
		// Prints frequencies of individual words

		//w := strings.Fields(strings.ToLower(string(b)))
		w := strings.FieldsFunc(strings.ToLower(string(b)), func(r rune) bool {
			if r >= 'a' && r <= 'z' {
				return false
			}
			return true
		})
		fmt.Printf("Total words: %v\n", len(w))
		m := map[string]int{}
		for _, v := range w {
			m[v]++
		}
		fmt.Printf("Total unique words: %v\n\n", len(m))
		sm := gist5092053.SortMapByValue(m)
		//for i := len(sm) - 1; i >= 0; i-- { v := sm[i]
		for _, v := range sm {
			x := float64(v.Value) / float64(len(w)) * 100
			fmt.Printf("%v\t%v%%\t%v\n", v.Value, strconv.FormatFloat(x, 'f', 5, 64), v.Key)
		}
	} else if false {
		// 2-rune Markov chain

		runes := []rune(string(b))
		fmt.Printf("Total words: %v\n", len(runes)-1)
		m := map[string]int{}
		for i := 0; i < len(runes)-1; i++ {
			x := string(runes[i]) + string(runes[i+1])
			//fmt.Println(x)
			m[x]++
		}
		fmt.Printf("Total unique words: %v\n\n", len(m))
		sm := gist5092053.SortMapByValue(m)
		for _, v := range sm {
			fmt.Printf("%v\t%#v\n", v.Value, v.Key)
		}
	} else {
		// 2-rune Markov chain: Given "y", this prints the occurrence of "xy" for all "x"

		runes := []rune(string(b))
		fmt.Printf("Total words: %v\n\n", len(runes)-1)
		m := map[string]map[string]int{}
		for i := 0; i < len(runes)-1; i++ {
			add(m, string(runes[i]), string(runes[i+1]))
		}
		target := "\n"
		{
			total := 0
			for _, v := range m[target] {
				total += v
			}
			fmt.Printf("Total hits for %#v: %v\n", target, total)
		}
		sm := gist5092053.SortMapByValue(m[target])
		for _, v := range sm {
			fmt.Printf("%v\t%#v\n", v.Value, v.Key)
		}
	}
}

func add(m map[string]map[string]int, r1, r2 string) {
	mm, ok := m[r1]
	if !ok {
		mm = make(map[string]int)
		m[r1] = mm
	}
	mm[r2]++
}

// thisGoSourceFile returns the full path of the Go source file where this function was called from.
func thisGoSourceFile() string {
	_, file, _, _ := runtime.Caller(1)
	return file
}

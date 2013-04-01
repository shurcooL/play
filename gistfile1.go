package main

import (
	"fmt"
	. "gist.github.com/5092053.git"
	"io/ioutil"
	"strconv"
	"strings"
	"github.com/davecgh/go-spew/spew"
	. "gist.github.com/5286084.git"
)

var _ = strings.Fields
var _ = strconv.Itoa
var _ = ioutil.ReadFile
var _ = SortMapByValue
var _ = spew.Dump

func main() {
	file := "./GenProgram.go"
	b, err := ioutil.ReadFile(file); CheckError(err)

	if true {
		// Prints frequencies of individual words

		//w := strings.Fields(strings.ToLower(string(b)))
		w := strings.FieldsFunc(strings.ToLower(string(b)), func(r rune) bool { if r >= 'a' && r <= 'z' { return false }; return true })
		fmt.Printf("Total words: %v\n", len(w))
		m := map[string]int{}
		for _, v := range w {
			m[v]++
		}
		fmt.Printf("Total unique words: %v\n\n", len(m))
		sm := SortMapByValue(m)
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
		sm := SortMapByValue(m)
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
		sm := SortMapByValue(m[target])
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
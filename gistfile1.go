package main

import (
	"fmt"
	"io/ioutil"
	"sort"
	"strings"
	"strconv"
)

func CheckError(err error) { if nil != err { fmt.Printf("err: %v\n", err); panic(err) } }

// A data structure to hold a key/value pair.
type Pair struct {
	Key   string
	Value int
}

// A slice of Pairs that implements sort.Interface to sort by Value.
type PairList []Pair

func (p PairList) Swap(i, j int)      { p[i], p[j] = p[j], p[i] }
func (p PairList) Len() int           { return len(p) }
func (p PairList) Less(i, j int) bool { return p[i].Value > p[j].Value }

// A function to turn a map into a PairList, then sort and return it. 
func sortMapByValue(m map[string]int) PairList {
	p := make(PairList, len(m))
	i := 0
	for k, v := range m {
		p[i] = Pair{k, v}
		i++
	}
	sort.Sort(p)
	return p
}

func main() {
	file := "./GenProgram.go"
	b, err := ioutil.ReadFile(file); CheckError(err)
	//w := strings.Fields(strings.ToLower(string(b)))
	w := strings.FieldsFunc(strings.ToLower(string(b)), func(r rune) bool {if r >= 'a' && r <= 'z' { return false }; return true})
	fmt.Printf("Total words: %v\n", len(w))
	m := map[string]int{}
	for _, v := range w {
		m[v]++
	}
	fmt.Printf("Total unique words: %v\n\n", len(m))
	sm := sortMapByValue(m)
	for _, v := range sm {
		x := float64(v.Value) / float64(len(w)) * 100
		fmt.Printf("%v\t%v%%\t%v\n", v.Value, strconv.FormatFloat(x, 'f', 5, 64), v.Key)
	}
}
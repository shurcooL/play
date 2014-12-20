// Splits phraseswithoutspaces (e.g. hashtags) into phrases with spaces.
package main

// first argument - Dictionary.txt file
// Stdin - input phrases

import (
	"fmt"
	"io/ioutil"
	"os"
	"regexp"
	"strings"
	"time"
	//"github.com/davecgh/go-spew/spew"

	. "github.com/shurcooL/go/gists/gist7651991"
)

var _ = fmt.Print
var _ = time.Now

//var _ = spew.Dump

func ProcessLinesFromFile(path string, exec func(string)) {
	f, err := os.Open(path)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer f.Close()
	ProcessLinesFromReader(f, exec)
}

func train(training_data string) map[string]int {
	NWORDS := make(map[string]int)
	pattern := regexp.MustCompile("[a-z]+")
	if content, err := ioutil.ReadFile(training_data); err == nil {
		for _, w := range pattern.FindAllString(strings.ToLower(string(content)), -1) {
			NWORDS[w]++
		}
	} else {
		panic("Failed loading training data.  Get it from http://norvig.com/big.txt.")
	}
	return NWORDS
}

func findMatches(in string, model map[string]int) [][]string {
	var out [][]string

	//for k, _ := range []rune(in) {
	runes := []rune(in)
	for k := len(runes); k >= 1; k-- {
		prefix := string(in[:k])
		suffix := string(in[k:])

		if wordExists(prefix, model) {
			if 0 == len(suffix) {
				out = append(out, []string{prefix})
			} else {
				sV := findMatches(suffix, model)

				if 0 != len(sV) {
					for k, _ := range sV {
						sV[k] = append([]string{prefix}, sV[k]...)
					}

					out = append(out, sV...)
				}
			}
		}
	}

	return out
}

func wordExists(in string, model map[string]int) bool {
	return (0 < model[in])
}

func filterMatches(in string, model map[string]int) string {
	found := findMatches(in, model)
	leastNumWords := len(in) + 1
	bestOut := in
	//spew.Dump(found)
	for _, v := range found {
		if len(v) < leastNumWords {
			leastNumWords = len(v)
			bestOut = strings.Join(v, " ")
		}
	}
	return bestOut
}

func main() {
	var dict_path string
	if len(os.Args) >= 2 {
		dict_path = os.Args[1]
	} else {
		fmt.Printf("Usage: %s Dictionary.txt\n", os.Args[0])
		os.Exit(1)
	}
	model := train(dict_path)
	_ = model
	//startTime := time.Now().UnixNano()
	//spew.Dump(len(model))
	//"input.txt"
	//fmt.Printf("Time : %v\n", float64(time.Now().UnixNano()-startTime)/float64(1e9))

	//fmt.Printf("%s", filterMatches("strangephrase", model))
	//path := "Work/input.txt"
	//ProcessLinesFromFile(path,
	ProcessLinesFromReader(os.Stdin,
		func(in string) {
			phrases := strings.Fields(in)
			for i := range phrases {
				phrases[i] = filterMatches(phrases[i], model)
			}
			fmt.Println(strings.Join(phrases, " "))
		})
}

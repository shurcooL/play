package main

// first argument - Dictionary.txt file
// Stdin - input phrases

import (
	"fmt"
	"io/ioutil"
	"regexp"
	"strings"
	"time"
	//"github.com/davecgh/go-spew/spew"
	"bufio"
	"io"
	"os"
)

var _ = fmt.Print
var _ = time.Now
//var _ = spew.Dump

func TrimNewline(line *string) {
	if len(*line) > 0 && (*line)[len(*line)-1] == '\n' {
		*line = (*line)[:len(*line)-1]
	}
}

func GetLinesFromFile(path string, exec func(string)) {
	f, err := os.Open(path)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer f.Close()
	GetLinesFromReader(f, exec)
}

func GetLinesFromReader(r0 io.Reader, exec func(string)) {
	r := bufio.NewReader(r0)
	line, err := r.ReadString('\n')
	for err == nil {
		TrimNewline(&line)
		exec(line)
		line, err = r.ReadString('\n')
	}
	TrimNewline(&line)
	exec(line)
	/*if err != io.EOF {
		fmt.Println(err)
		return
	}*/
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

func FindMatches(in string, model map[string]int) [][]string {
	var out [][]string

	//for k, _ := range []rune(in) {
	runes := []rune(in)
	for k := len(runes); k >= 1; k-- {
		prefix := string(in[:k])
		suffix := string(in[k:])

		if WordExists(prefix, model) {
			if 0 == len(suffix) {
				out = append(out, []string{prefix})
			} else {
				sV := FindMatches(suffix, model)

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

func WordExists(in string, model map[string]int) bool {
	return (0 < model[in])
}

func FilterMatches(in string, model map[string]int) string {
	found := FindMatches(in, model)
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

	//fmt.Printf("%s", FilterMatches("strangephrase", model))
	//path := "Work/input.txt"
	//GetLinesFromFile(path,
	GetLinesFromReader(os.Stdin,
		func(in string) {
			phrases := strings.Fields(in)
			for i := range phrases {
				phrases[i] = FilterMatches(phrases[i], model)
			}
			fmt.Println(strings.Join(phrases, " "))
		})
}
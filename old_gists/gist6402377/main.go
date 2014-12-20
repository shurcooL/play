// Tries to generate Go programs that compile.
package main

import (
	"bufio"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"io/ioutil"
	"math/rand"
	"os"
	"os/exec"
	"strings"
	"time"

	. "github.com/shurcooL/go/gists/gist5286084"
)

var _ os.File
var _ exec.Cmd
var _ = time.Second

var tempDir string

type stats struct {
	Good  uint64
	Tries uint64
}

func FileExists(name string) bool {
	_, err := os.Stat(name)
	return nil == err
}

func GenerateMainFunc() string {
	if 0 == rand.Int63n(10) {
		return `println("Hi")`
	}
	return `print_ln("Hi")`
}

var alphabet = map[string]float64{
	";":       10.0,
	"\n":      10.0,
	" ":       5.0,
	"print":   10.0,
	"println": 10.0,
	"(":       10.0,
	")":       10.0,
	"\"":      10.0,
	":":       10.0,
	",":       10.0,
	"{":       10.0,
	"}":       10.0,
	"[":       10.0,
	"]":       10.0,
	"_":       10.0,
	"+":       10.0,
	"-":       10.0,
	"*":       10.0,
	"/":       1.0,
	"\\":      10.0,
	"&&":      10.0,
	"||":      10.0,
	"&":       10.0,
	"|":       10.0,

	"a": 1.0,
	"b": 1.0,
	"c": 1.0,
	"d": 1.0,
	"e": 1.0,
	"f": 1.0,
	"g": 1.0,
	"h": 1.0,
	"i": 1.0,
	"j": 1.0,
	"k": 1.0,
	"l": 1.0,
	"m": 1.0,
	"n": 1.0,
	"o": 1.0,
	"p": 1.0,
	"q": 1.0,
	"r": 1.0,
	"s": 1.0,
	"t": 1.0,
	"u": 1.0,
	"v": 1.0,
	"w": 1.0,
	"x": 1.0,
	"y": 1.0,
	"z": 1.0,

	"A": 1.0,
	"B": 1.0,
	"C": 1.0,
	"D": 1.0,
	"E": 1.0,
	"F": 1.0,
	"G": 1.0,
	"H": 1.0,
	"I": 1.0,
	"J": 1.0,
	"K": 1.0,
	"L": 1.0,
	"M": 1.0,
	"N": 1.0,
	"O": 1.0,
	"P": 1.0,
	"Q": 1.0,
	"R": 1.0,
	"S": 1.0,
	"T": 1.0,
	"U": 1.0,
	"V": 1.0,
	"W": 1.0,
	"X": 1.0,
	"Y": 1.0,
	"Z": 1.0,

	"0": 1.0,
	"1": 1.0,
	"2": 1.0,
	"3": 1.0,
	"4": 1.0,
	"5": 1.0,
	"6": 1.0,
	"7": 1.0,
	"8": 1.0,
	"9": 1.0,
}
var totalProb float64

func GenerateMainFunc2() string {
	o := ""
	for i := 0; i < 4+rand.Int()%20; i++ {
		r := rand.Float64() * totalProb
		for k, v := range alphabet {
			if r < v {
				o += k
				break
			} else {
				r -= v
			}
		}
	}
	return o
}

// Prefix is a Markov chain prefix of one or more words.
type Prefix []string

// String returns the Prefix as a string (for use as a map key).
func (p Prefix) String() string {
	return strings.Join(p, "")
}

// Shift removes the first word from the Prefix and appends the given word.
func (p Prefix) Shift(word string) {
	copy(p, p[1:])
	p[len(p)-1] = word
}

// Chain contains a map ("chain") of prefixes to a list of suffixes.
// A prefix is a string of prefixLen words joined with spaces.
// A suffix is a single word. A prefix can have multiple suffixes.
type Chain struct {
	chain     map[string][]string
	prefixLen int
}

// NewChain returns a new Chain with prefixes of prefixLen words.
func NewChain(prefixLen int) *Chain {
	return &Chain{make(map[string][]string), prefixLen}
}

// Build reads text from the provided Reader and
// parses it into prefixes and suffixes that are stored in Chain.
func (c *Chain) Build(r io.Reader) {
	br := bufio.NewReader(r)
	p := make(Prefix, c.prefixLen)
	for {
		var s string
		if ru, size, err := br.ReadRune(); err != nil || size != 1 {
			break
		} else {
			s = string(ru)
		}
		key := p.String()
		c.chain[key] = append(c.chain[key], s)
		p.Shift(s)
	}
}

// Generate returns a string of at most n words generated from Chain.
func (c *Chain) Generate(n int) string {
	p := make(Prefix, c.prefixLen)
	//p[len(p)-4] = " "
	//p[len(p)-3] = "{"
	p[len(p)-2] = "\n"
	p[len(p)-1] = "\t"
	var words []string
	for {
		choices := c.chain[p.String()]
		if len(choices) == 0 {
			break
		}
		next := choices[rand.Intn(len(choices))]
		words = append(words, next)
		p.Shift(next)
		if len(words) >= 10 && rand.Intn(n) == 0 {
			break
		}
	}
	return strings.Join(words, "")
}

// for f in `find /usr/local/go/src/pkg -name '*.go'`; do echo "\"$f\","; done | pbcopy
var filenames = []string{ //"/Users/Dmitri/Dmitri/^Work/^GitHub/Conception/Gen/5086673/gistfile1.go",
	"/usr/local/go/src/pkg/strconv/atob.go",
	"/usr/local/go/src/pkg/strconv/atob_test.go",
	"/usr/local/go/src/pkg/strconv/atof.go",
	"/usr/local/go/src/pkg/strconv/atof_test.go",
	"/usr/local/go/src/pkg/strconv/atoi.go",
	"/usr/local/go/src/pkg/strconv/atoi_test.go",
	"/usr/local/go/src/pkg/strconv/decimal.go",
	"/usr/local/go/src/pkg/strconv/decimal_test.go",
	"/usr/local/go/src/pkg/strconv/extfloat.go",
	"/usr/local/go/src/pkg/strconv/fp_test.go",
	"/usr/local/go/src/pkg/strconv/ftoa.go",
	"/usr/local/go/src/pkg/strconv/ftoa_test.go",
	"/usr/local/go/src/pkg/strconv/internal_test.go",
	"/usr/local/go/src/pkg/strconv/isprint.go",
	"/usr/local/go/src/pkg/strconv/itoa.go",
	"/usr/local/go/src/pkg/strings/reader.go",
	"/usr/local/go/src/pkg/strings/reader_test.go",
	"/usr/local/go/src/pkg/strings/replace.go",
	"/usr/local/go/src/pkg/strings/replace_test.go",
	"/usr/local/go/src/pkg/strings/strings.go",
	"/usr/local/go/src/pkg/go/parser/error_test.go",
	"/usr/local/go/src/pkg/go/parser/example_test.go",
	"/usr/local/go/src/pkg/go/parser/interface.go",
	"/usr/local/go/src/pkg/go/parser/parser.go",
	"/usr/local/go/src/pkg/go/parser/parser_test.go",
	"/usr/local/go/src/pkg/go/parser/short_test.go",
	"/usr/local/go/src/pkg/go/printer/example_test.go",
	"/usr/local/go/src/pkg/go/printer/nodes.go",
	"/usr/local/go/src/pkg/go/printer/performance_test.go",
	"/usr/local/go/src/pkg/go/printer/printer.go",
	"/usr/local/go/src/pkg/go/printer/printer_test.go",
	"/usr/local/go/src/pkg/go/printer/testdata/parser.go",
	"/usr/local/go/src/pkg/go/scanner/errors.go",
	"/usr/local/go/src/pkg/go/scanner/example_test.go",
	"/usr/local/go/src/pkg/go/scanner/scanner.go",
	"/usr/local/go/src/pkg/go/scanner/scanner_test.go",
	"/usr/local/go/src/pkg/go/token/position.go",
	"/usr/local/go/src/pkg/go/token/position_test.go",
	"/usr/local/go/src/pkg/go/token/serialize.go",
	"/usr/local/go/src/pkg/go/token/serialize_test.go",
	"/usr/local/go/src/pkg/go/token/token.go",
}

var c *Chain

func GenerateMainFunc3() string {
	return c.Generate(50)
}

func GenerateProgram() string {
	return "package main; func main() {\n" + GenerateMainFunc3() + "\n}\n"
}

func VerifyProgram2(prog string) bool {
	//if len(strings.TrimSpace(prog)) == 0 ...

	file, err := parser.ParseFile(token.NewFileSet(), "", prog, 0)
	if err != nil {
		return false
	}
	if len(file.Decls[0].(*ast.FuncDecl).Body.List) < 2 {
		return false
	}
	return true
}

func VerifyProgram1(prog string) bool {
	f, err := os.Create(tempDir + "/GenProgram.go")
	CheckError(err)
	//defer os.Remove(f.Name())

	f.WriteString(prog)
	err = f.Close()
	CheckError(err)

	err = exec.Command("/usr/local/go/bin/go", "build", "-o", tempDir+"/Out", f.Name()).Run()
	defer os.Remove(tempDir + "/Out")

	return nil == err && FileExists(tempDir+"/Out")
}

func AppendToFile(name, text string) {
	f, err := os.OpenFile(name, os.O_APPEND|os.O_WRONLY, 0666)
	CheckError(err)
	defer f.Close()
	f.WriteString(text)
}

func main() {
	for _, v := range alphabet {
		totalProb += v
	}

	// Markov chain init
	c = NewChain(2) // Initialize a new Chain.
	for _, filename := range filenames {
		f, _ := os.Open(filename)
		defer f.Close()
		c.Build(f)
	}
	println("Chain size", len(c.chain))

	rand.Seed(time.Now().UnixNano())

	if false {
		for i := 0; i < 100; i++ {
			main := GenerateMainFunc3()
			println(main)
			println("----------------------------------------")
		}
		return
	}

	// Create the temporary Gen folder
	var err error
	tempDir, err = ioutil.TempDir(".", "Gen-")
	CheckError(err)
	fmt.Printf("Using %q as temp output dir (you can remove it afterwards).\n", tempDir)

	// Create log file if it doesn't exist (so we can append stuff to it)
	/*if !FileExists(tempDir + "/Log.txt") {
		f, err := os.Create(tempDir + "/Log.txt"); CheckError(err)
		err = f.Close(); CheckError(err)
	}*/

	stats := stats{}
	startTime := time.Now()
	nextPrintTime := startTime.Add(10 * time.Second)

	now := time.Now()
	fmt.Printf("\n\n%v %v STARTED Stats: %v/%v good/tries\n", now.Unix(), now, stats.Good, stats.Tries)
	//AppendToFile(tempDir + "/Log.txt", fmt.Sprintf("\n\n%v %v STARTED Stats: %v/%v good/tries\n", now.Unix(), now, Good, Tries))

	//for i := 0; i < 5000; i++ {
	for {
		prog := GenerateProgram()

		now = time.Now()
		stats.Tries++

		if VerifyProgram2(prog) && VerifyProgram1(prog) {
			stats.Good++
			fmt.Printf(" %v %v OMG SUCCESS: %s\n", now.Unix(), now, prog)
			//AppendToFile(tempDir + "/Log.txt", fmt.Sprintf(" %v %v OMG SUCCESS: %s\n", now.Unix(), now, prog))
		} else {
			//fmt.Printf(" %v %v Fail... err: %v\n", now.Unix(), now, err)
		}

		if now.After(nextPrintTime) {
			nextPrintTime = now.Add(10 * time.Minute)
			successRate := float64(stats.Good) / float64(stats.Tries) * 100
			opsPerSec := float64(stats.Tries) / time.Since(startTime).Seconds()
			fmt.Printf("%v %v Stats: %v/%v (%v%%) good/tries, %v ops/sec\n", now.Unix(), now, stats.Good, stats.Tries, successRate, opsPerSec)
			//AppendToFile(tempDir + "/Log.txt", fmt.Sprintf("%v %v Stats: %v/%v (%v%%) good/tries, %v ops/sec\n", now.Unix(), now, Good, Tries, successRate, opsPerSec))
		}
		//time.Sleep(time.Millisecond)
	}

	now = time.Now()
	fmt.Printf("%v %v FINISHED Stats: %v/%v (%v%%) good/tries\n\n", now.Unix(), now, stats.Good, stats.Tries, float64(stats.Good)/float64(stats.Tries)*100)
	//AppendToFile(tempDir + "/Log.txt", fmt.Sprintf("%v %v FINISHED Stats: %v/%v (%v%%) good/tries\n\n", now.Unix(), now, Good, Tries, float64(Good) / float64(Tries) * 100))
}

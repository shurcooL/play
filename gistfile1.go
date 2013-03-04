package main

import (
	"fmt"
	"os"
	"os/exec"
	"time"
	"math/rand"
)

var _ os.File
var _ exec.Cmd
var _ = time.Second

func CheckError(err error) { if nil != err { fmt.Printf("err: %v\n", err); panic(err) } }

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

var alphabet = map[string]float64 {
	";": 10.0,
	" ": 5.0,
	"print": 10.0,
	"println": 10.0,
	"(": 10.0,
	")": 10.0,
	"\"": 10.0,
	":": 10.0,
	",": 10.0,
	"{": 10.0,
	"}": 10.0,
	"[": 10.0,
	"]": 10.0,
	"_": 10.0,
	"+": 10.0,
	"-": 10.0,
	"*": 10.0,
	"/": 1.0,
	"\\": 10.0,
	"&&": 10.0,
	"||": 10.0,
	"&": 10.0,
	"|": 10.0,

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
	for i := 0; i < 4 + rand.Int() % 20; i++ {
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

func GenerateProgram() string {
	return "package main; func main() { " + GenerateMainFunc2() + " }"
}

func AppendToFile(name, text string) {
	f, err := os.OpenFile(name, os.O_APPEND|os.O_WRONLY, 0666); CheckError(err)
	defer f.Close()
	f.WriteString(text)
}

func main() {
	for _, v := range alphabet {
		totalProb += v
	}

	rand.Seed(time.Now().Unix())

	if false {
		for i := 0; i < 100; i++ {
			main := GenerateMainFunc2()
			println(len(main), main)
		}
		return
	}

	// Create log file if it doesn't exist (so we can append stuff to it)
	if !FileExists("./Gen/Log.txt") {
		f, err := os.Create("./Gen/Log.txt"); CheckError(err)
		err = f.Close(); CheckError(err)
	}

	var Good, Tries int
	startTime := time.Now()

	now := time.Now()
	fmt.Printf("\n\n%v %v STARTED Stats: %v/%v good/tries\n", now.Unix(), now, Good, Tries)
	AppendToFile("./Gen/Log.txt", fmt.Sprintf("\n\n%v %v STARTED Stats: %v/%v good/tries\n", now.Unix(), now, Good, Tries))

	//for i := 0; i < 5000; i++ {
	for {
		f, err := os.Create("./Gen/GenProgram.go"); CheckError(err)
		defer os.Remove(f.Name())

		prog := GenerateProgram()
		f.WriteString(prog)

		err = f.Close(); CheckError(err)

		err = exec.Command("/usr/local/go/bin/go", "build", "-o", "./Gen/Out", f.Name()).Run()
		defer os.Remove("./Gen/Out")
		now = time.Now()
		Tries = Tries + 1
		if (nil == err && FileExists("./Gen/Out")) {
			Good = Good + 1
			fmt.Printf(" %v %v OMG SUCCESS: %s\n", now.Unix(), now, prog)
			AppendToFile("./Gen/Log.txt", fmt.Sprintf(" %v %v OMG SUCCESS: %s\n", now.Unix(), now, prog))
		} else {
			//fmt.Printf(" %v %v Fail... err: %v\n", now.Unix(), now, err)
		}

		if 0 == Tries % 10000 {
			successRate := float64(Good) / float64(Tries) * 100
			opsPerSec := float64(Tries) / time.Since(startTime).Seconds()
			fmt.Printf("%v %v Stats: %v/%v (%v%%) good/tries, %v ops/sec\n", now.Unix(), now, Good, Tries, successRate, opsPerSec)
			AppendToFile("./Gen/Log.txt", fmt.Sprintf("%v %v Stats: %v/%v (%v%%) good/tries, %v ops/sec\n", now.Unix(), now, Good, Tries, successRate, opsPerSec))
		}
		time.Sleep(time.Millisecond)
	}

	now = time.Now()
	fmt.Printf("%v %v FINISHED Stats: %v/%v (%v%%) good/tries\n\n", now.Unix(), now, Good, Tries, float64(Good) / float64(Tries) * 100)
	AppendToFile("./Gen/Log.txt", fmt.Sprintf("%v %v FINISHED Stats: %v/%v (%v%%) good/tries\n\n", now.Unix(), now, Good, Tries, float64(Good) / float64(Tries) * 100))
}
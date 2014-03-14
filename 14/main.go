package main

import (
	"errors"
	"fmt"
	"os"
	"time"

	//. "gist.github.com/6096872.git"

	"labix.org/v2/pipe"
)

var stop bool // Hacky global variable that stops ChanWriter writes...

type ChanWriter chan []byte

func (cw ChanWriter) Write(p []byte) (n int, err error) {
	if !stop {
		cw <- p
		return len(p), nil
	} else {
		return 0, errors.New("stopped!")
	}
}

func ChanCombinedOutput(outch ChanWriter, p pipe.Pipe) error {
	s := pipe.NewState(outch, outch)
	err := p(s)
	if err == nil {
		err = s.RunTasks()
	}
	close(outch)
	return err
}

func main() {
	outch := make(ChanWriter)

	fmt.Print("Starting.\n\n")
	p := pipe.Script(
		pipe.Println("Building."),
		pipe.Exec("go", "build", "-o", "/Users/Dmitri/Desktop/pipe_bin", "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7176504.git/main.go"),
		pipe.Println("Running."),
		pipe.Exec("/Users/Dmitri/Desktop/pipe_bin"),
		pipe.Println("Done."),
	)

	go func() {
		time.Sleep(3 * time.Second)
		stop = true
	}()

	go func() {
		err := ChanCombinedOutput(outch, p)
		if err != nil {
			fmt.Printf("Error: %v\n\n", err)
		}
	}()

	for {
		b, ok := <-outch
		if !ok {
			break
		}
		os.Stdout.Write(b)
	}

	fmt.Print("\nPipe done.")
}

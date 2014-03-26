package main

import (
	"fmt"
	"os"
	"time"

	//. "gist.github.com/6096872.git"

	"github.com/shurcooL/pipe"
)

type ChanWriter chan []byte

func (cw ChanWriter) Write(p []byte) (n int, err error) {
	cw <- p
	return len(p), nil
}

func ChanCombinedOutput(outch ChanWriter, p pipe.Pipe) error {
	s := pipe.NewState(outch, outch)

	// Test interrupting the pipe after a few seconds.
	go func() {
		time.Sleep(5 * time.Second)
		s.Kill()
	}()

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

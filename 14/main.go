// Test for pipe's new Kill() API.
package main

import (
	"fmt"
	"os"
	"time"

	. "github.com/shurcooL/go/gists/gist6096872"

	"github.com/bradfitz/iter"
	"gopkg.in/pipe.v2"
)

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

func KillableTaskFuncPipe(f KillableTaskFunc) pipe.Pipe {
	return func(s *pipe.State) error {
		s.AddTask(&KillableTask{f: f})
		return nil
	}
}

type KillableTaskFunc func(s *pipe.State, task *KillableTask) error

type KillableTask struct {
	f        KillableTaskFunc
	isKilled bool
}

func (this *KillableTask) Run(s *pipe.State) error {
	return this.f(s, this)
}

func (this *KillableTask) Kill() {
	this.isKilled = true
}

func main() {
	fmt.Println("Starting.\n")
	p := pipe.Script(
		pipe.Println("Building."),
		pipe.Exec("go", "build", "-o", "/Users/Dmitri/Desktop/pipe_bin", "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7176504.git/main.go"),
		pipe.Println("Running."),
		//pipe.Exec("/Users/Dmitri/Desktop/pipe_bin"),
		KillableTaskFuncPipe(func(s *pipe.State, task *KillableTask) error {
			for i := 1; i <= 10 && !task.isKilled; i++ {
				time.Sleep(1000 * time.Millisecond)
				if i%3 != 0 {
					fmt.Fprintln(s.Stdout, i)
				} else {
					fmt.Fprintln(s.Stderr, i, "stderr")
				}
			}
			return nil
		}),
		pipe.Println("Done."),
	)

	for _ = range iter.N(2) {
		outch := make(ChanWriter)

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

		fmt.Println()
	}

	fmt.Println("Pipe done.")
}

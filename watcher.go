package main

import (
  "io"
//	"net/http"
	"log"
//	"html"
	"os"
	"os/exec"
	"fmt"
//	"strconv"
//	"time"
	"github.com/howeyc/fsnotify"
//	"flag"
)

func checkError(err error) {
	if nil != err {
		log.Fatal(err)
	}
}

func main() {

	if 2 != len(os.Args) {

		fmt.Fprintln(os.Stderr, "usage: ./watcher file\n (where file.go is the source of another program)")
		//return
		os.Exit(1)

	}

	var path string = os.Args[1]
	var process * os.Process = nil

	// Setup a watcher
	{
		var watcher * fsnotify.Watcher = nil

		// Create a new watcher
		{
			var err error
			watcher, err = fsnotify.NewWatcher()
			checkError(err)

			defer watcher.Close()
		}

		// Process events functions
		go func() {
			for {
				select {
					case /*ev :=*/ <-watcher.Event:
					{
						//log.Printf("Event: %v.\n", ev)

						if nil != process {
							//err := process.Kill()
							err := process.Signal(os.Interrupt)
							checkError(err)
							//fmt.Printf("Killed process %v.\n", process.Pid)
							process = nil
						}
					}

					case err := <-watcher.Error:
					{
						checkError(err)
					}
				}
			}
		} ()

		// Start watching the source file
		{
			err := watcher.Watch(path + ".go")
			checkError(err)
		}
	}

	// Main loop
	for {
		// Build the program, wait for completion
		{
			cmd := exec.Command("go", "build", path + ".go")
			err := cmd.Run()
			checkError(err)
		}

		// Run the program, wait for completion
		{
			fmt.Printf("%s\n", path)

			cmd := exec.Command(path)

			stdout, err := cmd.StdoutPipe()
			checkError(err)
			stderr, err := cmd.StderrPipe()
			checkError(err)

			err = cmd.Start()
			checkError(err)

			process = cmd.Process;

			go io.Copy(os.Stdout, stdout)
			go io.Copy(os.Stderr, stderr)

			cmd.Wait()

			fmt.Printf("\n")
		}
	}
}
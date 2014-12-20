// Runs another Go program (specified via first argument) and recompiles/restarts it whenever its source code file is modified.
package main

import (
	"io"
	//"net/http"
	//"html"
	"fmt"
	"os"
	"os/exec"
	//"strconv"
	"time"
	//"flag"

	"github.com/howeyc/fsnotify"
	. "github.com/shurcooL/go/gists/gist5286084"
	. "github.com/shurcooL/go/gists/gist5571468"
)

func main() {
	if 2 != len(os.Args) {
		fmt.Fprintln(os.Stderr, "usage: ./watcher file\n (where file.go is the source of another program)")
		os.Exit(1)
	}

	var path string = os.Args[1]
	var restart bool = true
	var process *os.Process
	var processState *os.ProcessState
	var oldContent string = TryReadFile(path + ".go")
	var killed bool = false

	// Setup a watcher
	{
		var watcher *fsnotify.Watcher = nil

		// Create a new watcher
		{
			var err error
			watcher, err = fsnotify.NewWatcher()
			CheckError(err)

			defer watcher.Close()
		}

		// Process events functions
		go func() {
			for {
				select {
				case /*ev :=*/ <-watcher.Event:
					{
						//log.Printf("Event: %v.\n", ev)
						//println("event (watcher)")

						// Check if the file has been changed externally, and if so, override this widget
						newContent := TryReadFile(path + ".go")
						if newContent == oldContent {
							continue
						} else {
							oldContent = newContent
						}

						if nil != process {
							//fmt.Printf("I should be killing process, but processState is %p\n", processState)
							//if processState != nil {
							//	fmt.Printf("  and its status is %v\n", processState.Exited())
							//}
							if processState == nil || !processState.Exited() {
								//err := process.Kill()
								killed = true
								err := process.Signal(os.Interrupt)
								CheckError(err)
								//fmt.Printf("Killed process %v.\n", process.Pid)
							}
							process = nil
							//println("Set process = nil")
							processState = nil
						}

						restart = true
						//println("actual change (watcher)")
					}

				case err := <-watcher.Error:
					CheckError(err)
				}
			}
		}()

		// Start watching the source file
		{
			err := watcher.Watch(path + ".go")
			CheckError(err)
		}
	}

	// Main loop
	for {
		for !restart {
			time.Sleep(200 * time.Millisecond)
			//fmt.Println("sleeping in main loop, process =", process)
		}
		restart = false
		killed = false
		time.Sleep(500 * time.Millisecond)

		// Build the program, wait for completion
		{
			//println("building")

			cmd := exec.Command("go", "build", "-o", path, path+".go")
			out, err := cmd.CombinedOutput()
			if err != nil {
				fmt.Println("error: " + string(out))
				continue
			}
		}

		// Run the program, wait for completion
		{
			//fmt.Println("running")

			cmd := exec.Command(path)

			stdout, err := cmd.StdoutPipe()
			CheckError(err)
			stderr, err := cmd.StderrPipe()
			CheckError(err)

			err = cmd.Start()
			CheckError(err)

			process = cmd.Process
			//println("assigned process")

			go io.Copy(os.Stdout, stdout)
			go io.Copy(os.Stderr, stderr)

			//println("main: starting to cmd.Wait()")
			cmd.Wait()
			if !killed {
				processState = cmd.ProcessState
			}
			//println("main: done with cmd.Wait()")

			fmt.Println("---")
		}
	}
}

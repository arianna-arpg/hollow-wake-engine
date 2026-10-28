#define WIN32_LEAN_AND_MEAN
#define PSAPI_VERSION 2
#include <windows.h>
#include <psapi.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>

/* Read only the explicitly supplied, live benchmark child. */
int main(int argc, char **argv) {
    if (argc != 2) return 2;
    char *end = NULL;
    errno = 0;
    unsigned long pid = strtoul(argv[1], &end, 10);
    if (errno || !pid || !end || *end || argv[1][0] == '-') return 2;
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, (DWORD)pid);
    if (!process) { fprintf(stderr, "OpenProcess: %lu\n", GetLastError()); return 3; }
    PROCESS_MEMORY_COUNTERS_EX memory = {0}; memory.cb = sizeof(memory);
    BOOL measured = GetProcessMemoryInfo(process, (PROCESS_MEMORY_COUNTERS *)&memory, sizeof(memory));
    DWORD error = measured ? 0 : GetLastError();
    CloseHandle(process);
    if (!measured) { fprintf(stderr, "GetProcessMemoryInfo: %lu\n", error); return 4; }
    printf("{\"pid\":%lu,\"privateCommitBytes\":%llu,\"workingSetBytes\":%llu,"
        "\"peakWorkingSetBytes\":%llu,\"pageFaultCount\":%lu}\n", pid,
        (unsigned long long)memory.PrivateUsage, (unsigned long long)memory.WorkingSetSize,
        (unsigned long long)memory.PeakWorkingSetSize, memory.PageFaultCount);
    return ferror(stdout) ? 5 : 0;
}

import * as core from '@actions/core';
import {context, getOctokit} from '@actions/github';
import {Octokit} from '@octokit/core';
import {Api} from '@octokit/plugin-rest-endpoint-methods/dist-types/types';

async function main() {
    const baseBranch = core.getInput('base');
    const headBranch = core.getInput('head');
    const token = core.getInput('github_token');

    const octokit = getOctokit(token);
    try {
        const response = await octokit.rest.repos.merge({
            owner: context.repo.owner,
            repo: context.repo.repo,
            base: baseBranch,
            head: headBranch,
            commit_message: `Auto merge down from ${headBranch}`,
        });
        
        core.setOutput('result', 'OK');
        
        return response
    } catch (error) {
        // Check for a conflict error (status code 409)
        if ((error as any).status === 409) {
            console.error(`Merge conflict: Could not merge ${headBranch} into ${baseBranch}.`);
            const formattedDate = new Date().toLocaleDateString('en-GB').replace(/\//g, '_');
            const newBranch = await createBranch(`${headBranch}_sync_${formattedDate}`, headBranch, octokit);
            // @ts-ignore
            core.setOutput('result', newBranch.data.ref);
            core.setFailed('Conflict needs to be resolved, abort merging down');
        } else {
            // Handle other possible errors
            core.setOutput('result', 'FAILED');
            console.error(`Error merging branches: ${(error as any).message}`);
            core.setFailed('Unknown error');
        }
    }
}

async function createBranch(newBranchName: string, baseBranch = 'main', octokit: Octokit & Api) {
    try {
        let response;
        
        // Step 1: Get the latest commit SHA of the base branch
        const { data: baseBranchInfo } = await octokit.rest.repos.getBranch({
            owner: context.repo.owner,
            repo: context.repo.repo,
            branch: baseBranch
        });

        const latestCommitSha = baseBranchInfo.commit.sha;

        // Step 2: Create a new reference (branch)
        // Step 2: Create a new reference (branch)
        try {
            response = await octokit.rest.git.createRef({
                owner: context.repo.owner,
                repo: context.repo.repo,
                ref: `refs/heads/${newBranchName}`,  // Name of the new branch
                sha: latestCommitSha,                // SHA of the head branch's latest commit
            });
            console.log(`Branch '${newBranchName}' created successfully.`);
        } catch (error) {
            // Check if the error is due to an existing reference
            if ((error as any).status === 422 && (error as any).message.includes("Reference already exists")) {
                console.log(`Branch '${newBranchName}' already exists. Attempting to fast-forward.`);

                // Step 3: Fast-forward the existing branch to the latest commit of headBranch
                response = await octokit.rest.git.updateRef({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    ref: `heads/${newBranchName}`,
                    sha: latestCommitSha,
                    force: true,
                });
                console.log(`Branch '${newBranchName}' fast-forwarded to the latest commit.`);
            } else {
                throw error;
            }
        }

        return response;
    } catch (error) {
        console.error(`Error creating branch '${newBranchName}':`, error);
    }
}

function run() {
    try {
        main();
    } catch (error: any) {
        core.setFailed(error.message);
    }
}

run();

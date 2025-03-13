#include "llvm/Pass.h"
#include "llvm/IR/Module.h"
#include "llvm/Passes/PassBuilder.h"
#include "llvm/Passes/PassPlugin.h"
#include "llvm/Support/raw_ostream.h"

using namespace llvm;

namespace {

struct SkeletonPass : public PassInfoMixin<SkeletonPass> {
    PreservedAnalyses run(Module &M, ModuleAnalysisManager &AM) {
        for (auto &F : M) {
            errs() << "I saw a function called " << F.getName() << "!\n";
            errs() << "Function body:\n";
            F.print(errs());

            for (auto &B : F) {
                errs() << "Basic block:\n";
                B.print(errs());

                for (auto &I : B) {
                    errs() << "Instruction: ";
                    I.print(errs(), true);
                    errs() << "\n";

                    // if I is an add instruction, change to mul
                    if (auto *BO = dyn_cast<BinaryOperator>(&I)) {
                        errs() << "Found Add: ";
                        BO->print(errs());

                        IRBuilder<> builder(BO);
                        Value* lhs = BO->getOperand(0);
                        Value* rhs = BO->getOperand(1);

                        errs() << "\nLHS and RHS: \n";
                        lhs->print(errs());
                        errs() << "\n";
                        rhs->print(errs());
                        errs() << "\n";

                        Value* mul = builder.CreateMul(lhs, rhs);

                        errs() << "New builder: \n";
                        mul->print(errs());
                        errs() << "\n";

                        for (auto &U : BO->uses()) {
                            User* user = U.getUser();
                            user->setOperand(U.getOperandNo(), mul);
                        }
                    }
                }
            }
        }
        // return PreservedAnalyses::all();
        return PreservedAnalyses::none();
    };
};

}

extern "C" LLVM_ATTRIBUTE_WEAK ::llvm::PassPluginLibraryInfo
llvmGetPassPluginInfo() {
    return {
        .APIVersion = LLVM_PLUGIN_API_VERSION,
        .PluginName = "Skeleton pass",
        .PluginVersion = "v0.1",
        .RegisterPassBuilderCallbacks = [](PassBuilder &PB) {
            PB.registerPipelineStartEPCallback(
                [](ModulePassManager &MPM, OptimizationLevel Level) {
                    MPM.addPass(SkeletonPass());
                });
        }
    };
}

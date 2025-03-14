#include "llvm/Pass.h"
#include "llvm/IR/Module.h"
#include "llvm/Passes/PassBuilder.h"
#include "llvm/Passes/PassPlugin.h"
#include "llvm/Support/raw_ostream.h"

constexpr bool DEBUG = false;

using namespace llvm;

namespace {

struct SkeletonPass : public PassInfoMixin<SkeletonPass> {
    PreservedAnalyses run(Module &M, ModuleAnalysisManager &AM) {
        bool changed = false;
        for (auto &F : M) {
            if (DEBUG) {
                errs() << "I saw a function called " << F.getName() << "\n";
                errs() << "Function body:\n";
                F.print(errs());
            }

            for (auto &B : F) {
                if (DEBUG) {
                    errs() << "Basic block:\n";
                    B.print(errs());
                }

                for (auto &I : B) {
                    if (DEBUG) {
                        errs() << "Instruction: ";
                        I.print(errs(), true);
                        errs() << "\n";
                    }

                    // if I is a mul by 2^n instruction, change to <<n
                    if (auto *BO = dyn_cast<BinaryOperator>(&I)) {
                        if (DEBUG) {
                            errs() << "Op: " << BO->getOpcode() << "\n";
                        }

                        if (BO->getOpcode() == Instruction::BinaryOps::Mul) {
                            if (DEBUG) {
                                errs() << "Found Mul: ";
                                BO->print(errs());
                            }

                            Value* lhs = BO->getOperand(0);
                            Value* rhs = BO->getOperand(1);

                            if (DEBUG) {
                                errs() << "\nLHS and RHS: \n";
                                lhs->print(errs());
                                errs() << "\n";
                                rhs->print(errs());
                                errs() << "\n";

                                errs() << "Type: " << rhs->getType()->getTypeID() << "\n";

                                errs() << rhs->getValueName() << "\n";
                            }

                            if (auto *rhsVal = dyn_cast<ConstantInt>(rhs)) {
                                if (DEBUG) {
                                    errs() << "FOUND INTEGER\n";
                                }
                                int64_t r = rhsVal->getSExtValue();
                                if (DEBUG) {
                                    errs() << r << "\n";
                                }

                                double log2root = log2(r);
                                
                                if (DEBUG) {
                                    errs() << log2root << "\n";
                                }

                                if (floor(log2root) == log2root && log2root > 0) {
                                    if (DEBUG) {
                                        errs() << "FOUND SHIFT CANDIDATE\n";
                                    }

                                    uint64_t rhsOfShift = static_cast<uint64_t>(log2root);

                                    IRBuilder<> builder(BO);
                                    Value* shl = builder.CreateShl(lhs, rhsOfShift);
        
                                    if (DEBUG) {
                                        errs() << "New builder: \n";
                                        shl->print(errs());
                                        errs() << "\n";
                                    }
        
                                    for (auto &U : BO->uses()) {
                                        User* user = U.getUser();
                                        user->setOperand(U.getOperandNo(), shl);

                                        changed = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return changed ? PreservedAnalyses::none() : PreservedAnalyses::all();
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
